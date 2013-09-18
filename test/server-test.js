'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

process.env.NODE_ENV = 'testing'; // ugly

var server = require('../server.js'),
    request = require('superagent'),
    expect = require('expect.js');

var SERVER_URL = 'http://localhost:3000';

describe('Server', function () {
    this.timeout(5000);

    describe('startup', function () {
        var serverApp;

        it('succeeds', function (done) {
            server.start(function (error, app) {
                expect(error).to.not.be.ok();
                expect(app).to.be.ok();

                serverApp = app;

                done();
            });
        });

        it('is reachable', function (done) {
            request.get(SERVER_URL + '/api/v1/version', function (err, res) {
                expect(res.statusCode).to.equal(200);
                done(err);
            });
        });

        it('should fail because already running', function (done) {
            server.start(function (error, app) {
                expect(error).to.be.ok();
                expect(app).to.not.be.ok();

                done();
            });
        });

        after(function (done) {
            server.stop(serverApp, function () {
                done();
            });
        });
    });

    describe('shutdown', function () {
        var serverApp;

        before(function (done) {
            server.start(function (err, app) {
                serverApp = app;
                done();
            });
        });

        it('succeeds', function (done) {
            server.stop(serverApp, function () {
                done();
            });
        });

        it('is not reachable anymore', function (done) {
            request.get(SERVER_URL + '/api/v1/version', function (err, res) {
                done();
            });
        });
    });
});
