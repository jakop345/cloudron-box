'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var server = require('../server.js'),
    request = require('superagent'),
    path = require('path'),
    crypto = require('crypto'),
    rimraf = require('rimraf'),
    os = require('os'),
    expect = require('expect.js');

var SERVER_URL = 'http://localhost:3000';
var BASE_DIR = path.resolve(os.tmpdir(), 'volume-test-' + crypto.randomBytes(4).readUInt32LE(0));
var CONFIG = {
    port: 3000,
    dataRoot: path.resolve(BASE_DIR, 'data'),
    configRoot: path.resolve(BASE_DIR, 'config'),
    mountRoot: path.resolve(BASE_DIR, 'mount'),
    silent: true
};

// remove all temporary folders
function cleanup(done) {
    rimraf(BASE_DIR, function (error) {
        done();
    });
}

describe('Server', function () {
    this.timeout(5000);

    after(cleanup);

    describe('startup', function () {
        var serverApp;

        it('fails due to wrong arguments', function (done) {
            expect(function () { server.start(); }).to.throwException();
            expect(function () { server.start(function () {}); }).to.throwException();
            expect(function () { server.start('foobar', function () {}); }).to.throwException();
            expect(function () { server.start(1337, function () {}); }).to.throwException();
            expect(function () { server.start(CONFIG); }).to.throwException();
            expect(function () { server.start(CONFIG, 'not a function'); }).to.throwException();
            expect(function () { server.start(CONFIG, 1337); }).to.throwException();

            done();
        });

        it('succeeds', function (done) {
            server.start(CONFIG, function (error, app) {
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
            server.start(CONFIG, function (error, app) {
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

    describe('runtime', function () {
        var serverApp;

        before(function (done) {
            server.start(CONFIG, function (err, app) {
                serverApp = app;
                done();
            });
        });

        it('random bad requests', function (done) {
            request.get(SERVER_URL + '/random', function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(401);
                done(err);
            });
        });

        it('version', function (done) {
            request.get(SERVER_URL + '/api/v1/version', function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(200);
                expect(res.body.version).to.equal(require('../package.json').version);
                done(err);
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
            server.start(CONFIG, function (err, app) {
                serverApp = app;
                done();
            });
        });

        it('fails due to wrong arguments', function (done) {
            expect(function () { server.stop(); }).to.throwException();
            expect(function () { server.stop(function () {}); }).to.throwException();
            expect(function () { server.stop('foobar', function () {}); }).to.throwException();
            expect(function () { server.stop(1337, function () {}); }).to.throwException();
            expect(function () { server.stop({}, function () {}); }).to.throwException();
            expect(function () { server.stop({ httpServer: {} }, 'something else'); }).to.throwException();
            expect(function () { server.stop({ httpServer: {} }, {}); }).to.throwException();

            done();
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
