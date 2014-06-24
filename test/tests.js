'use strict';

var assert = require('assert');
var util = require('util');

var ws = require('ws');


describe("accidentalbot.js", function() {
    var accidentalbot, botState;

    var MIN_FLOOD_WINDOW_SIZE = 20;

    beforeEach(function() {
        delete require.cache[require.resolve('../accidentalbot.js')];
        process.env.PORT = 0 | (Math.random() * 16383) + 49152;
        accidentalbot = require('../accidentalbot.js');
        botState = accidentalbot._getStateForTest();
    });

    describe("should send a REFRESH to a new client and respond to a PING", function() {
        var connection;
        var connectionClosed;

        beforeEach(function() {
            connection = null;
            connectionClosed = false;
        });

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
                setTimeout(function() {
                    util.log("sending PING");
                    connection.send(JSON.stringify({operation: 'PING'}));
                }, MIN_FLOOD_WINDOW_SIZE * 2);
                // delay this so our attack messages have a chance to be sent
                // and we don't fall into the same flood window


                connection.on('message', function(jsonData, flags) {
                    var data = JSON.parse(jsonData);
                    if (data.operation === 'PONG') {
                        util.log("got PONG");
                        partiallyDone();
                    }
                });
            });

            connection.on('close', function() {
                connectionClosed = true;
            });
        }

        it("under normal circumstances", function(done) {
            openTestConnection(done);
        });

        describe("even if another user has sent...", function(){
            beforeEach(function() {
                accidentalbot._disableOtherConnectionDisconnection();
                accidentalbot._setFloodWindowSize(MIN_FLOOD_WINDOW_SIZE);
            });

            var attackConnection = null;
            var attackConnectionClosed = false;
            function openAttackConnectionAnd(done, f) {
                attackConnection = new ws('ws://localhost:' + botState.port);
                attackConnection.on('open', function() {
                    f(done);
                });
                attackConnection.on('close', function() {
                    attackConnectionClosed = true;
                });
            }

            it("...a binary message", function(done) {
                var halfDone = partialDone(done, 2);

                openTestConnection(halfDone);
                openAttackConnectionAnd(halfDone, function(done) {
                    util.log("sending binary data");
                    attackConnection.send(new Int8Array(128), {binary: true, mask: true});
                    done();
                });
            });

            it("....invalid JSON", function(done) {
                var halfDone = partialDone(done, 2);

                openTestConnection(halfDone);
                openAttackConnectionAnd(halfDone, function(done) {
                    util.log("sending invalid JSON");
                    attackConnection.send("this ain't json");
                    done();
                });
            });

            afterEach(function(done) {
                setTimeout(function() {
                    assert(attackConnectionClosed, "Attacking users should have been disconnected.");
                    attackConnection.terminate();
                    done();
                }, 100);
            });
        });

        afterEach(function(done) {
            setTimeout(function() {
                assert(!connectionClosed, "Non-attacking users should not have been disconnected.");
                connection.terminate();
                done()
            });
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
