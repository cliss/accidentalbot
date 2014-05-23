var sugar = require('sugar');
var irc = require('irc');
var webSocket = require('ws');

var channel = '#atptest';

var titles = [];
var connections = [];

function sendToAll(packet) {
    connections.forEach(function (connection) {
        connection.send(JSON.stringify(packet));
    });
}

var client = new irc.Client('irc.freenode.net', 'accidentalbot', {
    channels: [channel]
});

client.addListener('join', function (channel, nick, message) {
    console.log('Joined channel ' + channel);
});

client.addListener('message', function (from, to, message) {
    if (message.startsWith('!s')) {
        var title = message.substring(3);

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
    socket.send(JSON.stringify({operation: 'REFRESH', titles: titles}));

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
        } else if (packet.operation === 'UPDATE') {
            socket.send(JSON.stringify(titles));
        } else {
            console.log("Don't know what to do with " + packet['operation']);
        }
    });
});
