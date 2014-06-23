/*
	Votes.js

	The purpose of this object is to encapsulate the data necessary to persist the showbot data
*/

var bloomfilter = require('bloomfilter');

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
			build(current, callback);
		} else {
			callback();
		}
	});
}

Votes.prototype.contains = function (data, comparator) {
	for (var key in this.items) {
		if (this.items.hasOwnProperty(key)) {
			if (comparator(JSON.parse(this.items[key].data), data)) {
				return true;
			}
		}
	}

	return false;
}

Votes.prototype.getAllForUser = function (user) {
	var ret = [];
	for (var key in this.items) {
		if (this.items.hasOwnProperty(key)) {
			var item = JSON.parse(this.items[key].data);
			item.id = key;
			item.votes = this.items[key].votes;
			item.voted = this.items[key].users.test(user);
			ret.push(item);
		}
	}
	return ret;
}

Votes.prototype.newItem = function (data) {
	var id = keygen(this.root);
	data = JSON.stringify(data);

	var item = {
		data: data,
		votesKey: keygen(this.root),
		usersKey: keygen(this.root),
		next: this.current
	};

	this.store.set(id, JSON.stringify(item));

	item.users = new bloomfilter.BloomFilter(bloomSize, bloomHashes);
	var users = JSON.stringify([].slice.call(item.users.buckets));
	this.store.set(item.usersKey, users);

	item.votes = 0;
	this.store.set(item.votesKey, item.votes.toString());

	// setting this last, in case we die before we get here
	this.current = id;
	this.store.set(this.root, id);

	this.items[id] = item;

	return id;
}

// returns the new score; if the user has already voted, return false
Votes.prototype.vote = function (id, user) {
	var item = this.items[id];
	var user = typeof user === 'undefined' ? user : user.toString();

	if (item) {
		var ret = JSON.parse(item.data);
		ret.succeeded = false;

		if (!user || !item.users.test(user)) {
			item.votes += 1;
			this.store.set(item.votesKey, item.votes.toString());

			if (user) {
				item.users.add(user);
				var users = JSON.stringify([].slice.call(item.users.buckets));
				this.store.set(item.usersKey, users);
			}

			ret.succeeded = true;
		}

		ret.votes = item.votes;
		return ret;
	}

	return false;
}

module.exports.Votes = Votes;
