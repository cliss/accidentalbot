var util = require('util');
var eventEmitter = require('events').EventEmitter;
var queryString = require('querystring');
var http = require('http');
var url = require('url');

function pastebin(key) {
	this.apiKey = key;
};

pastebin.prototype.callAPI = function(options,callback) {
	
	if(options.action === undefined) throw new Error('Missing non-optional option: action');
	if(options.action === 'paste' && options.content === undefined) throw new Error('Missing non-optional option: content');
	if(options.action === 'delete' && options.pasteKey === undefined) throw new Error('Missing non-optional option: pasteKey');
	if(options.action === 'delete' && options.userKey === undefined) throw new Error('Missing non-optional option: userKey');
	if(options.action === 'userdetails' && options.userKey === undefined) throw new Error('Missing non-optional option: userKey');
	
	var query = {
		api_dev_key: this.apiKey,
		api_option: options.action
	};
	
	if(options.userKey !== undefined)  query.api_user_key          = options.userKey;
	if(options.name !== undefined)     query.api_paste_name        = options.name;
	if(options.privacy !== undefined)  query.api_paste_private     = options.privacy;
	if(options.format !== undefined)   query.api_paste_format      = options.format;
	if(options.expire !== undefined)   query.api_paste_expire_date = options.expire;
	if(options.pasteKey !== undefined) query.api_paste_key         = options.pasteKey;
	if(options.content !== undefined)  query.api_paste_code        = options.content;
	if(options.limit !== undefined)    query.api_results_limit     = options.limit;
	
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
			callback('',new Error('Bad response code: ' + String(res.statusCode)));
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
	if(options.pasteKey === undefined) throw new Error('Missing non-optional option: pasteKey');
	
	var options = {
		hostname: 'pastebin.com',
		port: 80,
		path: url.format({
			pathname: '/raw.php',
			search: queryString.stringify({i: options.pasteKey})
		}),
		method: 'GET',
		headers: {'Host': 'pastebin.com'}
	};
	
	var req = http.request(options, function(res) {
		if(res.statusCode != 200) {
			callback('',new Error('Bad response code: ' + String(res.statusCode)));
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

pastebin.prototype.getUserKey = function(options,callback) {
	if(options.username === undefined) throw new Error('Missing non-optional option: username');
	if(options.password === undefined) throw new Error('Missing non-optional option: password');
	
	var query = {
		api_dev_key: this.apiKey,
		api_user_name: options.username,
		api_user_password: options.password
	};
	
	var stringifiedQuery = queryString.stringify(query);
	
	var httpOptions = {
		hostname: 'pastebin.com',
		port: 80,
		path: '/api/api_login.php',
		method: 'POST',
		headers: {
			'Content-length': stringifiedQuery.length,
			'Host': 'pastebin.com',
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	};
	
	var req = http.request(httpOptions, function(res) {
		if(res.statusCode != 200) {
			callback('',new Error('Bad response code: ' + String(res.statusCode)));
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
}

module.exports = pastebin;