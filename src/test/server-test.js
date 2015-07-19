/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var progress = require('../progress.js'),
    config = require('../config.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    request = require('superagent'),
    server = require('../server.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

function cleanup(done) {
    done();
}

describe('Server', function () {
    this.timeout(5000);

    before(function () {
        config.set('version', '0.5.0');
    });

    after(cleanup);

    describe('startup', function () {
        it('start fails due to wrong arguments', function (done) {
            expect(function () { server.start(); }).to.throwException();
            expect(function () { server.start('foobar', function () {}); }).to.throwException();
            expect(function () { server.start(1337, function () {}); }).to.throwException();

            done();
        });

        it('succeeds', function (done) {
            server.start(function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('is reachable', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/status', function (err, res) {
                expect(res.statusCode).to.equal(200);
                done(err);
            });
        });

        it('should fail because already running', function (done) {
            expect(server.start).to.throwException(function () {
                done();
            });
        });

        after(function (done) {
            server.stop(function () {
                done();
            });
        });
    });

    describe('runtime', function () {
        before(function (done) {
            server.start(done);
        });

        after(function (done) {
            database._clear(function (error) {
                expect(!error).to.be.ok();
                server.stop(function () {
                    done();
                });
            });
        });

        it('random bad requests', function (done) {
            request.get(SERVER_URL + '/random', function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(404);
                done(err);
            });
        });

        it('version', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/status', function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(200);
                expect(res.body.version).to.equal('0.5.0');
                done(err);
            });
        });

        it('status route is GET', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/status')
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(404);

                request.get(SERVER_URL + '/api/v1/cloudron/status')
                       .end(function (err, res) {
                    expect(res.statusCode).to.equal(200);
                    done(err);
                });
            });
        });
    });

    describe('config', function () {
        before(function (done) {
            server.start(done);
        });

        after(function (done) {
            server.stop(function () {
                done();
            });
        });

        it('config fails due missing token', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/config', function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(401);
                done(err);
            });
        });

        it('config fails due wrong token', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/config').query({ access_token: 'somewrongtoken' }).end(function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(401);
                done(err);
            });
        });
    });

    describe('progress', function () {
        before(function (done) {
            server.start(done);
        });

        after(function (done) {
            server.stop(function () {
                done();
            });
        });

        it('succeeds with no progress', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/progress', function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.update).to.be(null);
                expect(result.body.backup).to.be(null);
                done();
            });
        });

        it('succeeds with update progress', function (done) {
            progress.set(progress.UPDATE, 13, 'This is some status string');

            request.get(SERVER_URL + '/api/v1/cloudron/progress', function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.update).to.be.an('object');
                expect(result.body.update.percent).to.be.a('number');
                expect(result.body.update.percent).to.equal(13);
                expect(result.body.update.message).to.be.a('string');
                expect(result.body.update.message).to.equal('This is some status string');

                expect(result.body.backup).to.be(null);
                done();
            });
        });

        it('succeeds with no progress after clearing the update', function (done) {
            progress.clear(progress.UPDATE);

            request.get(SERVER_URL + '/api/v1/cloudron/progress', function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.update).to.be(null);
                expect(result.body.backup).to.be(null);
                done();
            });
        });
    });

    describe('shutdown', function () {
        before(function (done) {
            server.start(done);
        });

        it('fails due to wrong arguments', function (done) {
            expect(function () { server.stop(); }).to.throwException();
            expect(function () { server.stop('foobar'); }).to.throwException();
            expect(function () { server.stop(1337); }).to.throwException();
            expect(function () { server.stop({}); }).to.throwException();
            expect(function () { server.stop({ httpServer: {} }); }).to.throwException();

            done();
        });

        it('succeeds', function (done) {
            server.stop(function () {
                done();
            });
        });

        it('is not reachable anymore', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/status', function (error, result) {
                expect(error).to.not.be(null);
                done();
            });
        });
    });

    describe('cors', function () {
        before(function (done) {
            server.start(function (error) {
                done(error);
            });
        });

        it('responds to OPTIONS', function (done) {
            request('OPTIONS', SERVER_URL + '/api/v1/cloudron/status')
                .set('Access-Control-Request-Method', 'GET')
                .set('Access-Control-Request-Headers', 'accept, origin, x-requested-with')
                .set('Origin', 'http://localhost')
                .end(function (res) {
                expect(res.headers['access-control-allow-methods']).to.be('GET, PUT, DELETE, POST, OPTIONS');
                expect(res.headers['access-control-allow-credentials']).to.be('true');
                expect(res.headers['access-control-allow-headers']).to.be('accept, origin, x-requested-with'); // mirrored from request
                expect(res.headers['access-control-allow-origin']).to.be('http://localhost'); // mirrors from request
                done();
            });
        });

        after(function (done) {
            server.stop(function () {
                done();
            });
        });
    });

    describe('heartbeat', function () {
        var successfulHeartbeatGet;

        before(function (done) {
            server.start(done);

            var scope = nock(config.apiServerOrigin());
            successfulHeartbeatGet = scope.get('/api/v1/boxes/' + config.fqdn() + '/heartbeat');
            successfulHeartbeatGet.reply(200);
        });

        after(function (done) {
            server.stop(done);
            nock.cleanAll();
        });

        it('sends heartbeat', function (done) {
            setTimeout(function () {
                expect(successfulHeartbeatGet.counter).to.equal(1);
                done();
            }, 100);
        });
    });
});

