/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var clientdb = require('../../clientdb.js'),
    appdb = require('../../appdb.js'),
    async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    request = require('superagent'),
    server = require('../../server.js'),
    simpleauth = require('../../simpleauth.js'),
    nock = require('nock');

describe('SimpleAuth API', function () {
    var SERVER_URL = 'http://localhost:' + config.get('port');
    var SIMPLE_AUTH_ORIGIN = 'http://localhost:' + config.get('simpleAuthPort');

    var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';

    var APP_0 = {
        id: 'app0',
        appStoreId: '',
        manifest: { version: '0.1.0' },
        location: 'test0',
        portBindings: {},
        accessRestriction: 'user-foobar,user-someone',
        oauthProxy: true
    };

    var APP_1 = {
        id: 'app1',
        appStoreId: '',
        manifest: { version: '0.1.0' },
        location: 'test1',
        portBindings: {},
        accessRestriction: 'user-foobar,user-' + USERNAME + ',user-someone',
        oauthProxy: true
    };

    var APP_2 = {
        id: 'app2',
        appStoreId: '',
        manifest: { version: '0.1.0' },
        location: 'test2',
        portBindings: {},
        accessRestriction: '',
        oauthProxy: true
    };

    var CLIENT_0 = {
        id: 'someclientid',
        appId: 'someappid',
        type: clientdb.TYPE_SIMPLE_AUTH,
        clientSecret: 'someclientsecret',
        redirectURI: '',
        scope: 'user,profile'
    };

    var CLIENT_1 = {
        id: 'someclientid1',
        appId: APP_0.id,
        type: clientdb.TYPE_SIMPLE_AUTH,
        clientSecret: 'someclientsecret1',
        redirectURI: '',
        scope: 'user,profile'
    };

    var CLIENT_2 = {
        id: 'someclientid2',
        appId: APP_1.id,
        type: clientdb.TYPE_SIMPLE_AUTH,
        clientSecret: 'someclientsecret2',
        redirectURI: '',
        scope: 'user,profile'
    };

    var CLIENT_3 = {
        id: 'someclientid3',
        appId: APP_2.id,
        type: clientdb.TYPE_SIMPLE_AUTH,
        clientSecret: 'someclientsecret3',
        redirectURI: '',
        scope: 'user,profile'
    };

    before(function (done) {
        async.series([
            server.start.bind(server),
            simpleauth.start.bind(simpleauth),

            database._clear,

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

            clientdb.add.bind(null, CLIENT_0.id, CLIENT_0.appId, CLIENT_0.type, CLIENT_0.clientSecret, CLIENT_0.redirectURI, CLIENT_0.scope),
            clientdb.add.bind(null, CLIENT_1.id, CLIENT_1.appId, CLIENT_1.type, CLIENT_1.clientSecret, CLIENT_1.redirectURI, CLIENT_1.scope),
            clientdb.add.bind(null, CLIENT_2.id, CLIENT_2.appId, CLIENT_2.type, CLIENT_2.clientSecret, CLIENT_2.redirectURI, CLIENT_2.scope),
            clientdb.add.bind(null, CLIENT_3.id, CLIENT_3.appId, CLIENT_3.type, CLIENT_3.clientSecret, CLIENT_3.redirectURI, CLIENT_3.scope),
            appdb.add.bind(null, APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0.accessRestriction, APP_0.oauthProxy),
            appdb.add.bind(null, APP_1.id, APP_1.appStoreId, APP_1.manifest, APP_1.location, APP_1.portBindings, APP_1.accessRestriction, APP_1.oauthProxy),
            appdb.add.bind(null, APP_2.id, APP_2.appStoreId, APP_2.manifest, APP_2.location, APP_2.portBindings, APP_2.accessRestriction, APP_2.oauthProxy)
        ], done);
    });

    after(function (done) {
        async.series([
            database._clear,
            simpleauth.stop.bind(simpleauth),
            server.stop.bind(server)
        ], done);
    });

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
                clientId: CLIENT_0.id+CLIENT_0.id,
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
                clientId: CLIENT_0.id,
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
                clientId: CLIENT_0.id,
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

        it('cannot login with wrong password', function (done) {
            var body = {
                clientId: CLIENT_0.id,
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

        it('fails for unkown app', function (done) {
            var body = {
                clientId: CLIENT_0.id,
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

        it('fails for disallowed app', function (done) {
            var body = {
                clientId: CLIENT_1.id,
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

        it('succeeds for allowed app', function (done) {
            var body = {
                clientId: CLIENT_2.id,
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

        it('succeeds for app without accessRestriction', function (done) {
            var body = {
                clientId: CLIENT_3.id,
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
                clientId: CLIENT_3.id,
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
