var assert = require('assert');
var util = require('util');

var ws = require('ws');


var address = null;
var connection = null;
var withInvalid = false;

function restartFlooding() {
    assert(address !== null);

    if (connection) {
        connection.terminate();
    }

    connection = new ws(address, {'headers': {
        'x-forwarded-for': '127.0.' + (0 | (Math.random() * 256)) + '.' + (0 | (Math.random() * 256))
    }});

    var floodInterval = null;

    connection.on('open', function() {
//        util.log('flooding connected');
        floodInterval = setInterval(function() {
            var l = 10000;
            if (withInvalid) {
                l /= 5;
            }
            for (var i = 0; i < 2000; i++) {
                connection.send(JSON.stringify({operation: 'VOTE', id: 0}));
                if (withInvalid) {
                    connection.send([1, 'hello', {}]);
                    connection.send({foo: ['world', 2]});
                    connection.send(3.0);
                    connection.send([1, function(){}, new Uint8Array(1)]);
                }
            }
        }, 0);
    });

    connection.on('close', function() {
//        util.log("flooding disconnected");
        if (floodInterval) {
            clearInterval(floodInterval);
        }
        restartFlooding();
    });
}

function flood(newAddress) {
    address = newAddress;
    restartFlooding();
}

process.on('message', function(data) {
    var methods = {
        'flood': flood,
        'flood-invalid': function(address) {
            withInvalid = true;
            flood(address);
        }
    };

    if (methods.hasOwnProperty(data.method)) {
        setTimeout(function() {
            methods[data.method].apply(null, data.params);
        }, 0);
    }
});

if (process.send) {
    process.send(null);
}
