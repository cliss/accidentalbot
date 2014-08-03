// Todo: Add error checking. Not sure how, thanks to the poorly designed pastebin api

var util = require('util');
var eventEmitter = require('events').EventEmitter;
var queryString = require('querystring');
var http = require('http');
var url = require('url');

// util.inherits(pastebin,eventEmitter);

function pastebin(key) {
	// eventEmitter.call(this);
	this.apiKey = key;
};

pastebin.prototype.callAPI = function(options,callback) {
	
	if(options.action === undefined) throw new Error('Missing non-optional option');
	if(options.action === 'paste' && options.content === undefined) throw new Error('Missing non-optional option');
	
	var query = {
		api_dev_key: this.apiKey,
		api_option: options.action,
		api_paste_code: options.content
	};
	
	if(options.userKey !== undefined) query.api_user_key = options.userKey;
	if(options.name !== undefined) query.api_paste_name = options.name;
	if(options.privacy !== undefined) query.api_paste_private = options.privacy;
	if(options.limit !== undefined) query.api_results_limit = options.limit;
	
	var stringifiedQuery = queryString.stringify(query);
	
	var httpOptions = {
		hostname: 'pastebin.com',
		port: 80,
		path: '/api/api_post.php',
		method: 'POST',
		headers: {
			'Content-length': stringifiedQuery.length,
			'Host': 'pastebin.com',
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	};
	
	var req = http.request(httpOptions, function(res) {
		if(res.statusCode != 200) {
			callback('',new Error('Bad response code'));
			return;
		}
		var response = '';
		res.on('data', function (chunk) {
			response += chunk;
		});
		
		res.on('end', function() {
			if(response.indexOf('Bad API request') > -1) {
				callback(response,new Error(response));
				return;
			}
			callback(response);
		});
	});

	req.on('error', function(e) {
		callback('',e);
	});

	req.write(stringifiedQuery);
	req.end();
};

pastebin.prototype.getRawPaste = function(options,callback) {
	if(options.id === undefined) throw new Error('Missing non-optional option');
	
	var options = {
		hostname: 'pastebin.com',
		port: 80,
		path: url.format({
			pathname: '/raw.php',
			search: queryString.stringify({i: options.id})
		}),
		method: 'GET',
		headers: {'Host': 'pastebin.com'}
	};
	
	var req = http.request(options, function(res) {
		if(res.statusCode != 200) {
			callback('',new Error('Bad response code'));
			return;
		}
		var response = '';
		res.on('data', function (chunk) {
			response += chunk;
		});
		res.on('end',function() {
			callback(response);
		});
	});
	req.end();
};

module.exports = pastebin;