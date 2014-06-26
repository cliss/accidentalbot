'use strict';

var assert = require('assert');
var util = require('util');
var child_process = require('child_process');

var ws = require('ws');


describe("accidentalbot.js", function() {
    var accidentalbot, botState;

    var MIN_FLOOD_WINDOW_SIZE = 20;

    beforeEach(function() {
        delete require.cache[require.resolve('../accidentalbot.js')];
        process.env.PORT = 0 | (Math.random() * 16383) + 49152;
        process.env.PROXIED = 'true'; // we may want to spoof IPs
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
            var attackConnection = null;
            var attackConnectionClosed = false;
            function openAttackConnectionAnd(done, f) {
                attackConnection = new ws('ws://localhost:' + botState.port, {'headers': {
                    'x-forwarded-for': '127.0.' + (0 | (Math.random() * 256)) + '.' + (0 | (Math.random() * 256))
                }});
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

            it("...a string that is not valid JSON", function(done) {
                var halfDone = partialDone(done, 2);

                openTestConnection(halfDone);
                openAttackConnectionAnd(halfDone, function(done) {
                    util.log("sending a non-JSON string");
                    attackConnection.send("hello world");
                    done();
                });
            });

            it("...a message that's invalid at the WS protocol level", function(done) {
                var halfDone = partialDone(done, 2);

                openTestConnection(halfDone);
                openAttackConnectionAnd(halfDone, function(done) {
                    util.log("sending an invalid WebSocket request");
                    attackConnection._sender.frameAndSend(0xA, new Buffer(128), true, 0);
                    done();
                });
            });

            afterEach(function(done) {
                if (attackConnection) {
                    setTimeout(function() {
                       assert(attackConnectionClosed, "Attacking users should have been disconnected.");
                        attackConnection && attackConnection.terminate();
                        done();
                    }, 100);
                } else {
                    done();
                }
            });
        });

        describe("even if it's being flooded with requests", function() {
            var childProcesses = [];
            beforeEach(function(done) {
                var n = 1;
                var partiallyDone = partialDone(done, n + 1);

                for (var i = 0; i < n; i++) {
                    spawnChild();
                }

                function spawnChild() {
                    var child = child_process.fork('./test/flood.js');
                    child.on('message', function() {
                        child.send({
                            method: 'flood',
                            params: ['ws://localhost:' + botState.port],
                            execArgv: []
                        });
                        partiallyDone();
                    });

                    childProcesses.push(child);
                }

                // help the child processes get going before we try to connect
                setTimeout(partiallyDone, 500);
            });

            it("should survive", function(done) {
                openTestConnection(done);
            });

            afterEach(function() {
                for (var i = 0; i < childProcesses.length; i++) {
                    childProcesses[i].kill();
                }
            });
        });

        describe("even if it's being flooded with potentially-invalid requests", function() {
            var childProcesses = [];
            beforeEach(function(done) {
                var n = 1;
                var partiallyDone = partialDone(done, n + 1);

                for (var i = 0; i < n; i++) {
                    spawnChild();
                }

                function spawnChild() {
                    var child = child_process.fork('./test/flood.js');
                    child.on('message', function() {
                        child.send({
                            method: 'flood-invalid',
                            params: ['ws://localhost:' + botState.port],
                            execArgv: []
                        });
                        partiallyDone();
                    });

                    childProcesses.push(child);
                }

                // help the child processes get going before we try to connect
                setTimeout(partiallyDone, 500);
            });

            it("should survive", function(done) {
                openTestConnection(done);
            });

            afterEach(function() {
                for (var i = 0; i < childProcesses.length; i++) {
                    childProcesses[i].kill();
                }
            });
        });

        afterEach(function(done) {
            if (connection) {
                setTimeout(function() {
                    assert(!connectionClosed, "Non-attacking users should not have been disconnected.");
                    connection && connection.terminate();
                    done()
                }, 100);
            } else {
                done();
            }
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
