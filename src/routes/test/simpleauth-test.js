/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var clientdb = require('../../clientdb.js'),
    async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    request = require('superagent'),
    server = require('../../server.js'),
    simpleauth = require('../../simpleauth.js'),
    nock = require('nock'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');
var SIMPLE_AUTH_ORIGIN = 'http://localhost:' + config.get('simpleAuthPort');

var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var CLIENT = {
    id: 'someclientid',
    appId: 'someappid',
    clientSecret: 'someclientsecret',
    redirectURI: '',
    scope: 'user,profile'
};

var server;
function setup(done) {
    async.series([
        server.start.bind(server),
        simpleauth.start.bind(simpleauth),

        userdb._clear,

        function createAdmin(callback) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
            var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result.statusCode).to.eql(201);
                expect(scope1.isDone()).to.be.ok();
                expect(scope2.isDone()).to.be.ok();

                callback();
            });
        },

        function addClient(callback) {
            clientdb.add(CLIENT.id, CLIENT.appId, CLIENT.clientSecret, CLIENT.redirectURI, CLIENT.scope, callback);
        }
    ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('SimpleAuth API', function () {
    before(setup);
    after(cleanup);

    describe('login', function () {
        it('cannot login without clientId', function (done) {
            var body = {};

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot login without username', function (done) {
            var body = {
                clientId: 'someclientid'
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot login without password', function (done) {
            var body = {
                clientId: 'someclientid',
                username: USERNAME
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot login with unkown clientId', function (done) {
            var body = {
                clientId: CLIENT.id+CLIENT.id,
                username: USERNAME,
                password: PASSWORD
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot login with unkown user', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME+USERNAME,
                password: PASSWORD
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot login with empty password', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: ''
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot login with wrgon password', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: PASSWORD+PASSWORD
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: PASSWORD
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(200);
                expect(result.body.accessToken).to.be.a('string');
                expect(result.body.user).to.be.an('object');
                expect(result.body.user.id).to.be.a('string');
                expect(result.body.user.username).to.be.a('string');
                expect(result.body.user.email).to.be.a('string');
                expect(result.body.user.admin).to.be.a('boolean');

                request.get(SERVER_URL + '/api/v1/profile')
                .query({ access_token: result.body.accessToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result.body).to.be.an('object');
                    expect(result.body.username).to.eql(USERNAME);

                    done();
                });
            });
        });
    });

    describe('logout', function () {
        var accessToken;

        before(function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: PASSWORD
            };

            request.post(SIMPLE_AUTH_ORIGIN + '/api/v1/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(200);

                accessToken = result.body.accessToken;

                done();
            });
        });

        it('fails without access_token', function (done) {
            request.get(SIMPLE_AUTH_ORIGIN + '/api/v1/logout')
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with unkonwn access_token', function (done) {
            request.get(SIMPLE_AUTH_ORIGIN + '/api/v1/logout')
            .query({ access_token: accessToken+accessToken })
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            request.get(SIMPLE_AUTH_ORIGIN + '/api/v1/logout')
            .query({ access_token: accessToken })
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(200);

                request.get(SERVER_URL + '/api/v1/profile')
                .query({ access_token: accessToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });
        });
    });
});
