'use strict';

var sugar = require('sugar');
var irc = require('irc');
var webSocket = require('ws');
var crypto = require('crypto');

var channel = '#atp';
var webAddress = 'http://www.caseyliss.com/showbot';
var TITLE_LIMIT = 75;

var titles = {};
var links = {};
var connections = [];

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

    if (title.length <= 0 || title.length > TITLE_LIMIT) {
        client.say(from, 'Invalid title length; please try again.');
        return;
    }
    var shaTitle = crypto.createHash('sha1').update(title.toLowerCase()).digest('hex');

    // Make sure this isn't a duplicate.
    if (!titles.hasOwnProperty(shaTitle)) {
        var title = {
            author: from,
            title: title,
            titleLower: title.toLowerCase(),
            votes: 0,
            votesBy: {},
            time: new Date()
        };
        titles[shaTitle] = title;
        var data = {};
        data[shaTitle] = title;

        sendToAll({operation: 'NEW', title: data});
    } else {
        client.say(from, 'Sorry, your title is a duplicate. Please try another!');
    }
}

// this is deserving of a better algorithm
// but, I was in a rush and didn't want to use anything fancy
function handleSendVotes(from, message) {
    var titlesByVote = [];
    var votes1 = 0;
    var item1 = '';
    var votes2 = 0;
    var item2 = '';
    var votes3 = 0;
    var item3 = '';

    for (var title in titles) {
        if (titles[title].votes > votes1) {
            votes3 = votes2;
            votes2 = votes1;
            item3 = item2;
            item2 = item1;
            votes1 = titles[title].votes;
            item1 = title;
        } else {
            if (titles[title].votes > votes2) {
                votes3 = votes2;
                item3 = item2;
                votes2 = titles[title].votes;
                item2 = title;
            } else {
                if (titles[title].votes > votes3) {
                    votes3 = titles[title].votes;
                    item3 = title;
                }
            }
        }
    }

    client.say(from, 'Three most popular titles:');

    if (votes1 > 0) {
        client.say(from, votes1 + ' vote' + (votes1 != 1 ? 's' : '') +  ': " ' + titles[item1].title + '"');
    }
    if (votes2 > 0) {
        client.say(from, votes2 + ' vote' + (votes2 != 1 ? 's' : '') +  ': " ' + titles[item2].title + '"');
    }
    if (votes3 > 0) {
        client.say(from, votes3 + ' vote' + (votes3 != 1 ? 's' : '') +  ': " ' + titles[item3].title + '"');
    }
}

function handleNewLink(from, message) {
    if (message.startsWith('!link')) {
        message = message.substring(6);
    } else if (message.startsWith('!l')) {
        message = message.substring(3);
    }
    if (message.length <= 0 || message.length > 512) { // arbitrary upper limit to keep things happy
        client.say(from, 'Invalid link length; please try again.');
        return;
    }
    var shaLink = crypto.createHash('sha1').update(message.toLowerCase()).digest('hex');

    if (message.startsWith('http')) {
        // Make sure this isn't a duplicate.
        if (!links.hasOwnProperty(shaLink)) {
            var link = {
                author: from,
                link: message,
                time: new Date()
            };
            links[shaLink] = link;
            var data = {};
            data[shaLink] = link;

            sendToAll({operation: 'NEWLINK', link: data});
        } else {
            client.say(from, 'Sorry, your link is a duplicate. Please try another!');
        }
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
    if (proxied && request.headers['x-forwarded-for']) {
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

socketServer.on('connection', function(socket) {
    if (floodedBy(socket)) return;

    connections.push(socket);
    var address = getRequestAddress(socket.upgradeReq);
    console.log('Client connected: ' + address);

    // Instead of sending all of the information about current titles to the
    // newly-connecting user, which would include the IP addresses of other
    // users, we just send down the information they need.
    var titlesWithVotes = Object.map(titles, function (title) {
        var isVoted = titles[title]['votesBy'].hasOwnProperty(address);
        var newTitle = {
            author: titles[title].author,
            title: titles[title].title,
            votes: titles[title].votes,
            voted: isVoted,
            time: titles[title].time
        };
        return newTitle;
    });
    socket.send(JSON.stringify({operation: 'REFRESH', titles: titlesWithVotes, links: links}));

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
            if (titles.hasOwnProperty(packet['id'])) {
                var upvoted = titles[packet['id']];
                
                // Has this IP voted for this title?
                if (!upvoted['votesBy'].hasOwnProperty(address)) {
                    upvoted['votes'] = Number(upvoted['votes']) + 1;
                    upvoted['votesBy'][address] = true;
                    sendToAll({operation: 'VOTE', votes: upvoted['votes'], id: packet['id']});
                    console.log('+1 for ' + upvoted['title'] + ' by ' + address);
                } else {
                    console.log('ignoring duplicate vote by ' + address + ' for ' + upvoted['title']);
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
