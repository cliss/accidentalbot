var sugar = require('sugar');
var irc = require('irc');
var webSocket = require('ws');

var channel = '#somechannel';

var titles = [];
var connections = [];
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
    if (message.startsWith('!suggest')) {
        title = message.substring(9);
    } else if (message.startsWith('!s')) {
        title = message.substring(3);
    }

    if (title.length > 75) {
        client.say(from, 'That title is too long; please try again.');
        title = '';
    }
    if (title.length > 0) {
        // Make sure this isn't a duplicate.
        if (titles.findAll({titleLower: title.toLowerCase()}).length === 0) {
            var title = {
                id: titles.length,
                author: from,
                title: title,
                titleLower: title.toLowerCase(),
                votes: 0,
                time: new Date()
            };
            titles.push(title);

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
    message = message.substring(6);
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
    client.say(from, '!votes - get the three most highly voted titles.')
    client.say(from, '!link {URL} - suggest a link.');
    client.say(from, '!help - see this message.');
}

var client = new irc.Client('irc.freenode.net', 'accidentalbot', {
    channels: [channel]
});

client.addListener('join', function (channel, nick, message) {
    console.log('Joined channel ' + channel);
    setInterval(saveBackup, 300000);
});

client.addListener('message', function (from, to, message) {
    var title = '';

    if (message.startsWith('!s')) {
        handleNewSuggestion(from, message);
    } else if (message.startsWith("!votes")) {
        handleSendVotes(from, message);
    } else if (message.startsWith('!link')) {
        handleNewLink(from, message);
    } else if (message.startsWith('!help')) {
        handleHelp(from);
    }
});

client.addListener('error', function (message) {
    console.log('error: ', message)
});

/***************************************************
 * WEB SOCKETS                                     *
 ***************************************************/

var port = Number(process.env.PORT || 5001);
var socketServer = new webSocket.Server({port: port});

socketServer.on('connection', function(socket) {
    connections.push(socket);
    socket.send(JSON.stringify({operation: 'REFRESH', titles: titles, links: links}));

    socket.on('close', function () {
        connections.splice(connections.indexOf(socket), 1);
    });

    socket.on('message', function (data, flags) {
        var packet = JSON.parse(data);
        if (packet.operation === 'VOTE') {
            var matches = titles.findAll({id: packet['id']});
            if (matches.length > 0) {
                matches[0]['votes'] = new Number(matches[0]['votes']) + 1;
                sendToAll({operation: 'VOTE', votes: matches[0]['votes'], id: matches[0]['id']});
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
