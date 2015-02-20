/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var progress = require('../progress.js'),
    config = require('../../config.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    request = require('superagent'),
    server = require('../server.js');

var SERVER_URL = 'http://localhost:' + config.get('port');
var ACCESS_TOKEN = null;

function cleanup(done) {
    done();
}

describe('Server', function () {
    this.timeout(5000);

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
            expect(server.start).to.throwException(function (e) {
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
            database.clear(function (error) {
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
                expect(res.body.version).to.equal(null);
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

        it('stats fails due missing token', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/stats').end(function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(401);
                done(err);
            });
        });

        it('stats', function (done) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
            var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'admin', password: 'password', email: 'xx@xx.xx' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                expect(scope1.isDone());
                expect(scope2.isDone());

                ACCESS_TOKEN = res.body.token;

                request.get(SERVER_URL + '/api/v1/cloudron/stats').query({ access_token: ACCESS_TOKEN }).end(function (err, res) {
                    expect(err).to.not.be.ok();
                    expect(res.statusCode).to.equal(200);
                    expect(res.body).to.be.an(Object);
                    expect(res.body.drives).to.be.an(Array);
                    expect(res.body.drives[0]).to.be.an(Object);
                    expect(res.body.drives[0].mountpoint).to.be.a('string');
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
            config.set('token', 'forheartbeat');
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

