/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var cloudron = require('../cloudron.js'),
    config = require('../../config.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    request = require('superagent'),
    Server = require('../server.js');

var SERVER_URL = 'http://localhost:' + config.get('port');
var ACCESS_TOKEN = null;

function cleanup(done) {
    done();
}

describe('Server', function () {
    this.timeout(5000);

    after(cleanup);

    describe('startup', function () {
        var server;

        it('start fails due to wrong arguments', function (done) {
            var s = new Server();

            expect(function () { s.start(); }).to.throwException();
            expect(function () { s.start('foobar', function () {}); }).to.throwException();
            expect(function () { s.start(1337, function () {}); }).to.throwException();

            done();
        });

        it('succeeds', function (done) {
            server = new Server();

            server.start(function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('is reachable', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/version', function (err, res) {
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
        var server;

        before(function (done) {
            server = new Server();
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
            request.get(SERVER_URL + '/api/v1/cloudron/version', function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(200);
                expect(res.body.version).to.equal(require('../../package.json').version);
                done(err);
            });
        });

        it('firsttime route is GET', function (done) {
            request.post(SERVER_URL + '/api/v1/firsttime')
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(404);

                request.get(SERVER_URL + '/api/v1/firsttime')
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
            var data = { username: 'admin', password: 'password', email: 'xx@xx.xx' };
            request.post(SERVER_URL + '/api/v1/createadmin').send(data).end(function (err, res) {
                expect(res.statusCode).to.equal(201);

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
        var server;

        before(function (done) {
            server = new Server();
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

    describe('shutdown', function () {
        var server;

        before(function (done) {
            server = new Server();
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
            request.get(SERVER_URL + '/api/v1/cloudron/version', function (error, result) {
                expect(error).to.not.be(null);
                done();
            });
        });
    });

    describe('cors', function () {
        var server;

        before(function (done) {
            server = new Server();
            server.start(function (error) {
                done(error);
            });
        });

        it('responds to OPTIONS', function (done) {
            request('OPTIONS', SERVER_URL + '/api/v1/cloudron/version')
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
        var server, successfulHeartbeatGet;

        before(function (done) {
            config.set('token', 'forheartbeat');
            server = new Server();
            server.start(done);

            var scope = nock(config.appServerUrl());
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

    describe('graphite urls', function () {
        var server, scope;

        before(function (done) {
            scope = nock('http://127.0.0.1:8000')
            scope.get('/graphite/someurl').reply(200); // url must not have access_token

            server = new Server();
            server.start(done);
        });

        after(function (done) {
            nock.cleanAll();
            server.stop(done);
        });

        it('can access graphite url', function (done) {
            request.get(SERVER_URL + '/graphite/someurl').query({ access_token: ACCESS_TOKEN }).end(function (error, res) {
                expect(res.statusCode).to.be(200);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });
    });
});

