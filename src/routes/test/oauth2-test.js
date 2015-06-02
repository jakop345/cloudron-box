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
        resetToken: hat(256)
    };

    // make csrf always succeed for testing
    oauth2.csrf = function (req, res, next) {
        req.csrfToken = function () { return hat(256); };
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
            .query({ reset_token: hat(256) })
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
            .query({ reset_token: hat(256) })
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
            .send({ resetToken: hat(256) })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to empty password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/session/password/reset')
            .send({ password: '', resetToken: hat(256) })
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
            var scope = nock(config.adminOrigin())
                .filteringPath(function (path) {
                    path = path.replace(/accessToken=[^&]*/, 'accessToken=token');
                    path = path.replace(/expiresAt=[^&]*/, 'expiresAt=1234');
                    return path;
                })
                .get('/?accessToken=token&expiresAt=1234').reply(200, {});

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
