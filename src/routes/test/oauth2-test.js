/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var expect = require('expect.js'),
    uuid = require('node-uuid'),
    hat = require('hat'),
    nock = require('nock'),
    async = require('async'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    oauth2 = require('../oauth2.js'),
    server = require('../../server.js'),
    database = require('../../database.js'),
    userdb = require('../../userdb.js'),
    config = require('../../../config.js'),
    superagent = require('superagent'),
    passport = require('passport');

var SERVER_URL = 'http://localhost:' + config.get('port');

describe('OAuth2', function () {
    var passportAuthenticateSave = null;

    before(function () {
        passportAuthenticateSave = passport.authenticate;
        passport.authenticate = function () {
            return function (req, res, next) { next(); };
        };
    });

    after(function () {
        passport.authenticate = passportAuthenticateSave;
    });

    describe('scopes middleware', function () {
        it('fails due to missing authInfo', function (done) {
            var mw = oauth2.scope('admin')[1];
            var req = {};

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to missing scope property in authInfo', function (done) {
            var mw = oauth2.scope('admin')[1];
            var req = { authInfo: {} };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to missing scope in request', function (done) {
            var mw = oauth2.scope('admin')[1];
            var req = { authInfo: { scope: '' } };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to wrong scope in request', function (done) {
            var mw = oauth2.scope('admin')[1];
            var req = { authInfo: { scope: 'foobar,something' } };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to wrong scope in request', function (done) {
            var mw = oauth2.scope('admin,users')[1];
            var req = { authInfo: { scope: 'foobar,admin' } };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('succeeds with one requested scope and one provided scope', function (done) {
            var mw = oauth2.scope('admin')[1];
            var req = { authInfo: { scope: 'admin' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with one requested scope and two provided scopes', function (done) {
            var mw = oauth2.scope('admin')[1];
            var req = { authInfo: { scope: 'foobar,admin' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with two requested scope and two provided scopes', function (done) {
            var mw = oauth2.scope('admin,foobar')[1];
            var req = { authInfo: { scope: 'foobar,admin' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with two requested scope and provided wildcard scope', function (done) {
            var mw = oauth2.scope('admin,foobar')[1];
            var req = { authInfo: { scope: '*' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });
    });

});

describe('Password', function () {
    var USER_0 = {
        userId: uuid.v4(),
        username: 'someusername',
        password: 'somepassword',
        email: 'some@email.com',
        admin: true,
        salt: 'somesalt',
        createdAt: (new Date()).toUTCString(),
        modifiedAt: (new Date()).toUTCString(),
        resetToken: hat()
    };

    // make csrf always succeed for testing
    oauth2.csrf = function (req, res, next) {
        req.csrfToken = function () { return hat(); };
        next();
    };

    function setup(done) {
        server.start(function (error) {
            expect(error).to.not.be.ok();
            database._clear(function (error) {
                expect(error).to.not.be.ok();

                userdb.add(USER_0.userId, USER_0, done);
            });
        });
    }

    function cleanup(done) {
        database._clear(function (error) {
            expect(error).to.not.be.ok();

            server.stop(done);
        });
    }

    describe('pages', function () {
        before(setup);
        after(cleanup);

        it('reset request succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/resetRequest.html')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.text.indexOf('<!-- tester -->')).to.not.equal(-1);
                expect(result.statusCode).to.equal(200);
                done();
            });
        });

        it('setup fails due to missing reset_token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/setup.html')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('setup fails due to invalid reset_token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/setup.html')
            .query({ reset_token: hat() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('setup succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/setup.html')
            .query({ reset_token: USER_0.resetToken })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.text.indexOf('<!-- tester -->')).to.not.equal(-1);
                done();
            });
        });

        it('reset fails due to missing reset_token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/reset.html')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('reset fails due to invalid reset_token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/reset.html')
            .query({ reset_token: hat() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('reset succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/reset.html')
            .query({ reset_token: USER_0.resetToken })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.text.indexOf('<!-- tester -->')).to.not.equal(-1);
                expect(result.statusCode).to.equal(200);
                done();
            });
        });

        it('sent succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/session/password/sent.html')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.text.indexOf('<!-- tester -->')).to.not.equal(-1);
                expect(result.statusCode).to.equal(200);
                done();
            });
        });
    });

    describe('reset request handler', function () {
        before(setup);
        after(cleanup);

        it('succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/session/password/resetRequest')
            .send({ identifier: USER_0.email })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.text.indexOf('<!-- tester -->')).to.not.equal(-1);
                expect(result.statusCode).to.equal(200);
                done();
            });
        });
    });

    describe('reset handler', function () {
        before(setup);
        after(cleanup);

        it('fails due to missing resetToken', function (done) {
            superagent.post(SERVER_URL + '/api/v1/session/password/reset')
            .send({ password: 'somepassword' })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to missing password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/session/password/reset')
            .send({ resetToken: hat() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to empty password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/session/password/reset')
            .send({ password: '', resetToken: hat() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to empty resetToken', function (done) {
            superagent.post(SERVER_URL + '/api/v1/session/password/reset')
            .send({ password: '', resetToken: '' })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            var scope = nock(config.adminOrigin()).get('/').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/session/password/reset')
            .send({ password: 'somepassword', resetToken: USER_0.resetToken })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(scope.isDone()).to.be.ok();
                expect(result.statusCode).to.equal(200);
                done();
            });
        });
    });
});

describe('Clients', function () {
    var USER_0 = {
        userId: uuid.v4(),
        username: 'someusername',
        password: 'somepassword',
        email: 'some@email.com',
        admin: true,
        salt: 'somesalt',
        createdAt: (new Date()).toUTCString(),
        modifiedAt: (new Date()).toUTCString(),
        resetToken: hat()
    };
    var token;

    // make csrf always succeed for testing
    oauth2.csrf = function (req, res, next) {
        req.csrfToken = function () { return hat(); };
        next();
    };

    function setup(done) {
        async.series([
            server.start.bind(server),
            database._clear.bind(null),
            function (callback) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                       .query({ setupToken: 'somesetuptoken' })
                       .send({ username: USER_0.username, password: USER_0.password, email: USER_0.email })
                       .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result.statusCode).to.eql(201);
                    expect(scope1.isDone()).to.be.ok();
                    expect(scope2.isDone()).to.be.ok();

                    // stash for further use
                    token = result.body.token;

                    callback();
                });
            }
        ], done);
    }

    function cleanup(done) {
        database._clear(function (error) {
            expect(error).to.not.be.ok();

            server.stop(done);
        });
    }

    describe('get', function () {
        before(setup);
        after(cleanup);

        it('fails due to missing token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to empty token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients')
            .query({ access_token: '' })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to wrong token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients')
            .query({ access_token: token.toUpperCase() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);

                expect(result.body.clients.length).to.eql(1);
                expect(result.body.clients[0].tokenCount).to.eql(1);

                done();
            });
        });
    });

    describe('get tokens by client', function () {
        before(setup);
        after(cleanup);

        it('fails due to missing token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to empty token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .query({ access_token: '' })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to wrong token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .query({ access_token: token.toUpperCase() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to unkown client', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients/CID-WEBADMIN/tokens')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(404);
                done();
            });
        });

        it('succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);

                expect(result.body.tokens.length).to.eql(1);
                expect(result.body.tokens[0].identifier).to.eql('user-' + USER_0.username);

                done();
            });
        });
    });

    describe('delete tokens by client', function () {
        before(setup);
        after(cleanup);

        it('fails due to missing token', function (done) {
            superagent.del(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to empty token', function (done) {
            superagent.del(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .query({ access_token: '' })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to wrong token', function (done) {
            superagent.del(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .query({ access_token: token.toUpperCase() })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to unkown client', function (done) {
            superagent.del(SERVER_URL + '/api/v1/oauth/clients/CID-WEBADMIN/tokens')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(404);
                done();
            });
        });

        it('succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);

                expect(result.body.tokens.length).to.eql(1);
                expect(result.body.tokens[0].identifier).to.eql('user-' + USER_0.username);

                superagent.del(SERVER_URL + '/api/v1/oauth/clients/cid-webadmin/tokens')
                .query({ access_token: token })
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(204);

                    // further calls with this token should not work
                    superagent.get(SERVER_URL + '/api/v1/profile')
                    .query({ access_token: token })
                    .end(function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result.statusCode).to.equal(401);
                        done();
                    });
                });
            });
        });
    });
});
