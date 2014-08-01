/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var apptask = require('../apptask.js'),
    expect = require('expect.js'),
    net = require('net');

describe('apptask', function () {
    it('initializes succesfully', function (done) {
        apptask.initialize(done);
    });

    it('free port', function (done) {
        apptask._getFreePort(function (error, port) {
            expect(error).to.be(null);
            expect(port).to.be.a('number');
            var client = net.connect(port);
            client.on('connect', function () { done(new Error('Port is not free:' + port)); });
            client.on('error', function (error) { done(); });
        });
    });
});
 
