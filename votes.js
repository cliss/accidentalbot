/*
	Votes.js

	The purpose of this object is to encapsulate the data necessary to persist the showbot data
*/

var bloomfilter = require('bloomfilter');
var memjs = require('memjs');


var bloomSize = 256;
var bloomHashes = 7;


/* Generates unique keys, hopefully */
var keygen = function (prefix) {
	if (typeof prefix !== 'string') {
		prefix = '';
	}
	return prefix + '_' + Math.random().toString(36).substring(7);
}

function Votes (root, store) {
	this.root = root;
	this.store = store;
	this.items = {};
}

Votes.prototype = Object.create(Object.prototype);
Votes.prototype.constructor = Votes;

Votes.prototype.load = function (callback) {
	var votes = this;

	if (typeof callback !== 'function') {
		callback = function () {};
	}

	function fetch (key, callback) {
		votes.store.get(key, function (item) {
			item = JSON.parse(item);
			votes.store.get(item.usersKey, function (users) {
				item.users = new bloomfilter.BloomFilter(JSON.parse(users), bloomHashes);
				votes.store.get(item.votesKey, function (votes) {
					item.votes = parseInt(votes, 10);
					callback(item);
				});
			});
		});
	}

	function build (id, callback) {
		fetch(id, function (result) {
			votes.items[id] = result;
			if (typeof(result.next) === 'string' && result.next !== '') {
				build(result.next, callback);
			} else {
				if (callback) {
					callback();
				}
			}
		});
	}

	votes.store.get(votes.root, function (current) {
		votes.current = current;

		if (typeof(current) === 'string' && current !== '') {
			build(current, callback.bind(votes));
		} else {
			callback.bind(votes)();
		}
	});
}

Votes.prototype.newItem = function (data) {
	var id = keygen(this.root);

	var item = {
		data: data,
		votesKey: keygen(this.root),
		usersKey: keygen(this.root),
		next: this.current
	};

	store.set(id, JSON.stringify(item));

	item.users = new bloomfilter.BloomFilter(bloomSize, bloomHashes);
	var users = JSON.stringify([].slice.call(item.users.buckets));
	store.set(item.usersKey, users);

	item.votes = 0;
	store.set(item.votesKey, item.votes.toString());

	// setting this last, in case we die before we get here
	this.current = id;
	store.replace(this.root, id);

	this.items[id] = item;

	return id;
}

// returns the new score; if the user has already voted, return false
Votes.prototype.vote = function (id, user) {
	var item = this.items[id];
	var user = typeof user === 'undefined' ? user : user.toString();

	if (item) {
		if (!user || !item.users.test(user)) {
			item.votes += 1;
			store.replace(item.votesKey, item.votes.toString());

			if (user) {
				item.users.add(user);
				var users = JSON.stringify([].slice.call(item.users.buckets));
				store.replace(item.usersKey, users);
			}
		}

		return item.votes;
	} else {
		return false;
	}
}

this.exports.Votes = Votes;
