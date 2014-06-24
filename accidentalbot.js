'use strict';

var sugar = require('sugar');
var irc = require('irc');
var webSocket = require('ws');
var crypto = require('crypto');

var settings = Object.freeze({
    ircNetwork:     'irc.freenode.net',
    ircChannelName: '#bchoatetest',
    ircBotName:     'bchoatebot',
    showbotLink:    'http://www.caseyliss.com/showbot',
    titleLimit:     75,
    useMemcached:   process.env.MEMCACHED_SERVERS || process.env.MEMCACHIER_SERVERS,
    cacheTtl:       60 * 60 * 24 * 2 // cache for two days
});

// we'll persist these things
var state = {
    titles:  [],
    votes:   [],
    links:   [],
    votesBy: []
};


/***************************************************
 * MEMCACHE                                        *
 ***************************************************/

var cache;
if (settings.useMemcached) {
    // will use defaults set in Heroku environment
    // (Memcachier addon must be enabled for this)
    var memjs = require('memjs');
    cache = memjs.Client.create();
}

function initStateFromCache(cb) {
    var count = Object.keys(state).length;
    Object.keys(state, function (k, v) {
        state[k] = [];
        if (!cache) {
            cb('no cache', null, k);
        } else {
            cache.get(k, function (err, value, key) {
                if (!err) {
                    if (key !== null && value !== null) {
                        try {
                            state[k] = JSON.parse(value.toString());
                        } catch (e) {
                            // ruhroh
                            console.log('Error parsing cache for ' + k + ' state:', e);
                        }
                    }
                } else {
                    console.log('Error fetching state key', k, 'from cache:', err);
                }
                if (cb) {
                    cb(err, value, k);
                }
            });
        }
    });
}

function updateState(thing, cb) {
    if (cache) {
        cache.set(thing, JSON.stringify(state[thing]), cb, settings.cacheTtl);
    } else {
        cb('no cache');
    }
}

initStateFromCache(function (err, value, key) {
    if (!err) {
        if (key === 'titles') {
            if (!err && state.titles.length) {
                console.log('loaded ' + state.titles.length + ' titles from cache...');
            } else {
                console.log('no titles were found in cache');
            }
        }
    }
});


/***************************************************
 * IRC                                             *
 ***************************************************/

var client;

function makeHash(str) {
    var md5 = crypto.createHash('md5');
    md5.update(str.toLowerCase());
    return md5.digest('hex');
}

function handleNewSuggestion(from, message) {
    var title = '';
    if (message.match(/^!s(?:uggest)?\s+(.+)/)) {
        title = RegExp.$1.compact();
    }

    if (title.length > settings.titleLimit) {
        client.say(from, 'That title is too long (over ' + settings.titleLimit +
            ' characters); please try again.');
        title = '';
    }
    if (title.length > 0) {
        // Make sure this isn't a duplicate.
        var titleHash = makeHash(title);
        if (state.titles.findAll({hash: titleHash}).length === 0) {
            var id = state.titles.length;
            var submission = {
                id: id,
                author: from,
                title: title,
                hash: titleHash,
                time: new Date()
            };
            state.titles[id] = submission;
            updateState('titles', function (err) {
                var data = Object.clone(submission);
                data.votes = 0;
                data.voted = false;
                sendToAll({operation: 'NEW', title: data});
            });
        } else {
            client.say(from, 'Sorry, your title is a duplicate. Please try another!');
        }
    }
}

function handleSendVotes(from, message) {
    var titlesByVote = state.titles.sortBy(function (t) {
        return state.votes[t.id] || 0;
    }, true).to(3);

    client.say(from, 'Three most popular titles:');
    titlesByVote.each(function (title) {
        var votes = state.votes[title.id] || 0;
        client.say(from, votes + ' vote' +
            (votes != 1 ? 's' : '') +  ': " ' + title.title + '"');
    });
}

function handleNewLink(from, message) {
    if (message.startsWith('!link ')) {
        message = message.substring(6).trim();
    } else if (message.startsWith('!l ')) {
        message = message.substring(3).trim();
    }

    if (message.startsWith('http')) {
        var id = state.links.length;
        var submission = {
            id: id,
            author: from,
            link: message,
            time: new Date()
        };
        state.links[id] = submission;

        updateState('links', function (err) {
            sendToAll({operation: 'NEWLINK', link: submission});
        });
    } else {
        client.say(from, "That doesn't look like a link to me.");
    }
}

function handleHelp(from) {
    client.say(from, 'Options:');
    client.say(from, '!s {title} - suggest a title.');
    client.say(from, '!votes - get the three most highly voted titles.');
    client.say(from, '!link {URL} - suggest a link.');
    client.say(from, '!help - see this message.');
    client.say(from, 'To see titles/links, go to: ' + settings.showbotLink);
}

client = new irc.Client(settings.ircNetwork, settings.ircBotName, {
    channels: [settings.ircChannelName]
});

client.addListener('join', function (channel, nick, message) {
    console.log('Joined channel ' + channel);
});

client.addListener('message', function (from, to, message) {
    if (message.startsWith('!s')) {
        handleNewSuggestion(from, message);
    } else if (message.startsWith('!votes')) {
        handleSendVotes(from, message);
    } else if (message.startsWith('!l')) {
        handleNewLink(from, message);
    } else if (message.startsWith('!help')) {
        handleHelp(from);
    }
});

client.addListener('error', function (message) {
    console.log('IRC error: ', message);
});


/***************************************************
 * WEB SOCKETS                                     *
 ***************************************************/

// an array of active websocket connections
var connections = [];

var port = Number(process.env.PORT || 5001);
var proxied = process.env.PROXIED === 'true';
var socketServer = new webSocket.Server({port: port});

// DOS protection - we disconnect any address which sends more than windowLimit
// messages in a window of windowSize milliseconds.
var windowLimit = 50;
var windowSize = 5000;
var currentWindow = 0;
var recentMessages = {};
function floodedBy(socket) {
    // To be called each time we get a message or connection attempt.
    //
    // If that address has been flooding us, we disconnect all open connections
    // from that address and return `true` to indicate that it should be
    // ignored. (They will not be prevented from re-connecting after waiting
    // for the next window.)
    if (socket.readyState == socket.CLOSED) {
        return true;
    }

    var address = getRequestAddress(socket.upgradeReq);

    var updatedWindow = 0 | ((new Date) / windowSize);
    if (currentWindow !== updatedWindow) {
        currentWindow = updatedWindow;
        recentMessages = {};
    }

    if (address in recentMessages) {
        recentMessages[address]++;
    } else {
        recentMessages[address] = 1;
    }

    if (recentMessages[address] > windowLimit) {
        console.warn("Disconnecting flooding address: " + address);
        socket.terminate();

        for (var i = 0, l = connections.length; i < l; i++) {
            if (getRequestAddress(connections[i].upgradeReq) === address &&
                connections[i] != socket) {
                console.log("Disconnecting additional connection.");
                connections[i].terminate();
            }
        }

        return true;
    } else {
        return false;
    }
}

function getRequestAddress(request) {
    if (proxied && 'x-forwarded-for' in request.headers) {
        // This assumes that the X-Forwarded-For header is generated by a
        // trusted proxy such as Heroku. If not, a malicious user could take
        // advantage of this logic and use it to to spoof their IP.
        var forwardedForAddresses = request.headers['x-forwarded-for'].split(',');
        return forwardedForAddresses[forwardedForAddresses.length - 1].trim();
    } else {
        // This is valid for direct deployments, without routing/load balancing.
        return request.connection.remoteAddress;
    }
}

function sendToAll(packet) {
    connections.forEach(function (connection) {
        connection.send(JSON.stringify(packet));
    });
}

socketServer.on('connection', function(socket) {
    if (floodedBy(socket)) {
        return;
    }

    connections.push(socket);
    var address = getRequestAddress(socket.upgradeReq);
    console.log('Client connected: ' + address);

    // Instead of sending all of the information about current titles to the
    // newly-connecting user, which would include the IP addresses of other
    // users, we just send down the information they need.
    var titlesWithVotes = state.titles.map(function (title) {
        var newTitle = {
            id: title.id,
            author: title.author,
            title: title.title,
            votes: state.votes[title.id] || 0,
            voted: state.votesBy[title.id] && state.votesBy[title.id][address] === true,
            time: title.time
        };
        return newTitle;
    });
    socket.send(JSON.stringify({operation: 'REFRESH', titles: titlesWithVotes, links: state.links}));

    socket.on('close', function () {
        console.log('Client disconnected: ' + address);
        connections.splice(connections.indexOf(socket), 1);
    });

    socket.on('message', function (data, flags) {
        if (floodedBy(socket)) return;

        if (flags.binary) {
            console.log("ignoring binary message from "  + address);
            return;
        }

        var packet;
        try {
            packet = JSON.parse(data);
        } catch (e) {
            console.log('Error parsing message from socket', e);
            return;
        }

        if (packet.operation === 'VOTE') {
            state.titles.findAll({id: packet['id']}).each(function (upvoted) {
                var id = upvoted.id;
                if (!state.votesBy[id]) {
                    state.votesBy[id] = {};
                }
                if (state.votesBy[id][address] !== true) {
                    state.votes[id] = Number(state.votes[id] || 0) + 1;
                    state.votesBy[id][address] = true;
                    updateState('votes', function (err) {
                        console.log('+1 for ' + upvoted['title'] + ' by ' + address);
                        sendToAll({operation: 'VOTE', votes: state.votes[id], id: id});
                    });
                    updateState('votesBy');
                } else {
                    console.log('ignoring duplicate vote by ' + address + ' for ' + upvoted['title']);
                }
            });
        } else if (packet.operation === 'PING') {
            socket.send(JSON.stringify({operation: 'PONG'}));
        } else {
            console.log("Don't know what to do with " + packet['operation']);
        }
    });
});
