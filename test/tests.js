'use strict';

var assert = require('assert');
var util = require('util');

var ws = require('ws');


describe("accidentalbot.js", function() {
    var accidentalbot, botState;

    beforeEach(function() {
        delete require.cache[require.resolve('../accidentalbot.js')];
        process.env.PORT = 0 | (Math.random() * 16383) + 49152;
        accidentalbot = require('../accidentalbot.js');
        botState = accidentalbot._getStateForTest();
    });

    describe("should send a REFRESH to a new client and respond to a PING", function() {
        this.timeout(100);
        var connection = null;

        function openTestConnection(done) {
            // Opens a connection, and calls done once it has send the initial
            // REFRESH and responded to a PING.
            var partiallyDone = partialDone(done, 2);

            connection = new ws('ws://localhost:' + botState.port);

            connection.on('message', function(jsonData, flags) {
                var data = JSON.parse(jsonData);
                if (data.operation === 'REFRESH') {
                    partiallyDone();
                }
            });

            connection.on('open', function() {
               connection.send(JSON.stringify({operation: 'PING'}));

                connection.on('message', function(jsonData, flags) {
                    var data = JSON.parse(jsonData);
                    if (data.operation === 'PONG') {
                        partiallyDone();
                    }
                });
            });
        }

        it("under normal circumstances", function(done) {
            openTestConnection(done);
        });

        describe("even if another user has sent...", function(){
            var attackConnection = null;
            function openAttackConnectionAnd(done, f) {
                attackConnection = new ws('ws://localhost:' + botState.port);
                attackConnection.on('open', function() {
                    f(done);
                });
            }

            it("...a binary message", function(done) {
                var halfDone = partialDone(done, 2);

                openTestConnection(halfDone);
                openAttackConnectionAnd(halfDone, function(done) {
                    connection.send(new Int8Array(128), {binary: true, mask: true});
                    done();
                });
            });

            it("....invalid JSON", function(done) {
                var halfDone = partialDone(done, 2);

                openTestConnection(halfDone);
                openAttackConnectionAnd(halfDone, function(done) {
                    attackConnection.send("this ain't json");
                    done();
                });
            });

            afterEach(function() {
                attackConnection.terminate();
            });
        });

        afterEach(function() {
            connection.terminate();
        });
    });

    after(function() {
        delete require.cache[require.resolve('../accidentalbot.js')];

        botState.client.disconnect();
        botState.socketServer.close();

        accidentalbot = null;
        botState = null;
    });
});


function partialDone(done, n) {
    var howDone = 0;
    return function() {
        howDone++;
        if (howDone === n) {
            done();
        } else {
            assert(howDone < n);
        }
    }
}
