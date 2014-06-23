'use strict';

var sugar = require('sugar');
var irc = require('irc');
var webSocket = require('ws');
var memjs = require('memjs');

var votes = require('./votes.js');

var channel = '#atp';
var webAddress = 'http://www.caseyliss.com/showbot';
var TITLE_LIMIT = 75;

var connections = [];

// A cache is just an object with get(id, callback) and set(id, value) properties
// This is just an example that is backed by a JS object
var cache = (function () {
    var data = {};
    return {
        get: function (id, callback) {
            callback(data[id] ? data[id].toString() : data[id]);
        },
        set: function (id, value) {
            data[id] = value;
        },
    };
})();

// This is a memcached cache using the memjs library.
// var cache = (function () {
//     var cache = memjs.Client.create();
//     return {
//         get: function (id, callback) {
//             cache.get(id, function (err, data) {
//                 callback(data ? data.toString() : data);
//             });
//         },
//         set: function (id, value) {
//             cache.set(id, value, function (err) {
//                 // nothing to do
//             }, 86400);
//         },
//     };
// })();


// prefix for the cache, this is YYYYMMDD
var prefix = (new Date()).toISOString().slice(0,10).replace(/-/g,"");

var titles = new votes.Votes(prefix + '_titles', cache);
var links = [];


function sendToAll(packet) {
    connections.forEach(function (connection) {
        connection.send(JSON.stringify(packet));
    });
}

function saveBackup() {
    // TODO: Figure out what to do here.
}

function handleNewSuggestion(from, message) {
    var title = '';
    if (message.match(/^!s(?:uggest)?\s+(.+)/)) {
        title = RegExp.$1.compact();
    }

    if (title.length > TITLE_LIMIT) {
        client.say(from, 'That title is too long (over ' + TITLE_LIMIT +
            ' characters); please try again.');
        title = '';
    }
    if (title.length > 0) {
        // Make sure this isn't a duplicate.

        title = {
            title: title,
            author: from,
            time: new Date(),
        }

        var contains = titles.contains(title, function (a, b) {
            return a.title.toLowerCase() === b.title.toLowerCase();
        });

        if (!contains) {
            title.id = titles.newItem(title);
            title.votes = 0;
            sendToAll({operation: 'NEW', title: title});
        } else {
            //client.say(channel, 'Sorry, ' + from + ', your title is a duplicate. Please try another!');
            client.say(from, 'Sorry, your title is a duplicate. Please try another!');
        }
    }
}

function handleSendVotes(from, message) {
    var titlesByVote = titles.sortBy(function (t) {
        return t.votes;
    }, true).to(3);

    client.say(from, 'Three most popular titles:');
    for (var i = 0; i < titlesByVote.length; ++i) {
        var votes = titlesByVote[i]['votes'];
        client.say(from, titlesByVote[i]['votes'] + ' vote' + (votes != 1 ? 's' : '') +  ': " ' + titlesByVote[i].title + '"');
    }
}

function handleNewLink(from, message) {
    if (message.startsWith('!link')) {
        message = message.substring(6);
    } else if (message.startsWith('!l')) {
        message = message.substring(3);
    }

    if (message.startsWith('http')) {
        var link = {
            id: links.length,
            author: from,
            link: message,
            time: new Date()
        };
        links.push(link);

        sendToAll({operation: 'NEWLINK', link: link});
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
    client.say(from, 'To see titles/links, go to: ' + webAddress);
}

var client = new irc.Client('irc.freenode.net', 'accidentalbot', {
    channels: [channel]
});

client.addListener('join', function (channel, nick, message) {
    console.log('Joined channel ' + channel);
    setInterval(saveBackup, 300000);
});

client.addListener('message', function (from, to, message) {
    if (message.startsWith('!s')) {
        handleNewSuggestion(from, message);
    } else if (message.startsWith("!votes")) {
        handleSendVotes(from, message);
    } else if (message.startsWith('!l')) {
        handleNewLink(from, message);
    } else if (message.startsWith('!help')) {
        handleHelp(from);
    }
});

client.addListener('error', function (message) {
    console.log('error: ', message);
});

/***************************************************
 * WEB SOCKETS                                     *
 ***************************************************/

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

function engage() {
    socketServer.on('connection', function(socket) {
        if (floodedBy(socket)) return;

        connections.push(socket);
        var address = getRequestAddress(socket.upgradeReq);
        console.log('Client connected: ' + address);

        socket.send(JSON.stringify({operation: 'REFRESH', titles: titles.getAllForUser(address), links: links}));

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

            var packet = JSON.parse(data);
            if (packet.operation === 'VOTE') {
                var title;
                if (title = titles.vote(packet['id'], address)) {
                    if (title.succeeded) {
                        sendToAll({operation: 'VOTE', votes: title.votes, id: packet['id']});
                        console.log('+1 for ' + title.title + ' by ' + address);
                    } else {
                        console.log('ignoring duplicate vote by ' + address + ' for ' + title.title);
                    }
                } else {
                    console.log('no matches for id: ' + packet['id']);
                }
            } else if (packet.operation === 'PING') {
                socket.send(JSON.stringify({operation: 'PONG'}));
            } else {
                console.log("Don't know what to do with " + packet['operation']);
            }
        });
    });
}

// this loads the state of the titles back from the cache, and calls its callback (no params) when done
titles.load(engage);

