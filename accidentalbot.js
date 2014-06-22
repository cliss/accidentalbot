var sugar = require('sugar');
var irc = require('irc');
var webSocket = require('ws');
var crypto = require('crypto');

var channel = '#atptest';
var webAddress = 'http://www.caseyliss.com/showbot'

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
    if (message.startsWith('!suggest')) {
        title = message.substring(9);
    } else if (message.startsWith('!s')) {
        title = message.substring(3);
    }

    if (title.length <= 0 || title.length > 75) {
        client.say(from, 'Invalid title length; please try again.');
        return;
    }
    var shatitle = crypto.createHash('sha1').update(title.toLowerCase()).digest('hex');

	// Make sure this isn't a duplicate.
	if (!titles.hasOwnProperty(shatitle)) {
		var title = {
			author: from,
			title: title,
			titleLower: title.toLowerCase(),
			votes: 0,
			votesBy: {},
			time: new Date()
		};
		titles[shatitle] = title;
		var data = {};
		data[shatitle] = title;

		sendToAll({operation: 'NEW', title: data});
	} else {
		client.say(from, 'Sorry, your title is a duplicate. Please try another!');
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
    if (message.length <= 0 || message.length > 512) { // arbitrary upper limit to keep things happy
        client.say(from, 'Invalid link length; please try again.');
        return;
    }
    var shalink = crypto.createHash('sha1').update(message.toLowerCase()).digest('hex');

    if (message.startsWith('http')) {
		// Make sure this isn't a duplicate.
		if (!links.hasOwnProperty(shalink)) {
			var link = {
				author: from,
				link: message,
				time: new Date()
			};
			links[shalink] = link;
			var data = {};
			data[shalink] = link;

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
    client.say(from, '!votes - get the three most highly voted titles.')
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
    console.log('error: ', message)
});

/***************************************************
 * WEB SOCKETS                                     *
 ***************************************************/

var port = Number(process.env.PORT || 5001);
var socketServer = new webSocket.Server({port: port});

socketServer.on('connection', function(socket) {
    connections.push(socket);
    // This is valid for direct deployments, without routing/load balancing.
    // var address = socket.upgradeReq.connection.remoteAddress;
    // This is valid for Heroku's routing. Your mileage may vary.
    var address = socket.upgradeReq.headers['x-forwarded-for'] || '127.0.0.1';
    console.log('Client connected: ' + address);
    var titlesWithVotes = Object.map(titles, function (title) {
        var isVoted = titles[title]['votesBy'].hasOwnProperty(address);
        var newTitle = Object.clone(titles[title], true);
        newTitle.voted = isVoted;
        return newTitle;
    });
    socket.send(JSON.stringify({operation: 'REFRESH', titles: titlesWithVotes, links: links}));

    socket.on('close', function () {
        console.log('Client disconnected: ' + address);
        connections.splice(connections.indexOf(socket), 1);
    });

    socket.on('message', function (data, flags) {
        if (flags.binary) {
            console.log("ignoring binary message from "  + address);
            return;
        }
        var packet = JSON.parse(data);
        if (packet.operation === 'VOTE') {
            var matches = titles.findAll({id: packet['id']});

            if (matches.length > 0) {
                var upvoted = matches[0];
                if (upvoted['votesBy'].any(address) == false) {
                    upvoted['votes'] = Number(upvoted['votes']) + 1;
                    upvoted['votesBy'].push(address);
                    sendToAll({operation: 'VOTE', votes: upvoted['votes'], id: upvoted['id']});
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
