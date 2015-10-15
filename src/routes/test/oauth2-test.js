/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var expect = require('expect.js'),
    uuid = require('node-uuid'),
    async = require('async'),
    hat = require('hat'),
    urlParse = require('url').parse,
    nock = require('nock'),
    HttpError = require('connect-lastmile').HttpError,
    oauth2 = require('../oauth2.js'),
    server = require('../../server.js'),
    querystring = require('querystring'),
    database = require('../../database.js'),
    clientdb = require('../../clientdb.js'),
    userdb = require('../../userdb.js'),
    user = require('../../user.js'),
    appdb = require('../../appdb.js'),
    config = require('../../config.js'),
    request = require('request'),
    superagent = require('superagent'),
    passport = require('passport');

var SERVER_URL = 'http://localhost:' + config.get('port');

describe('OAuth2', function () {

    describe('scopes middleware', function () {
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

    describe('flow', function () {
        var USER_0 = {
            id: uuid.v4(),
            username: 'someusername',
            password: 'somepassword',
            email: 'some@email.com',
            admin: true,
            salt: 'somesalt',
            createdAt: (new Date()).toUTCString(),
            modifiedAt: (new Date()).toUTCString(),
            resetToken: hat(256)
        };

        var APP_0 = {
            id: 'app0',
            appStoreId: '',
            manifest: { version: '0.1.0' },
            location: 'test',
            portBindings: {},
            accessRestriction: '',
            oauthProxy: true
        };

        var APP_1 = {
            id: 'app1',
            appStoreId: '',
            manifest: { version: '0.1.0' },
            location: 'test1',
            portBindings: {},
            accessRestriction: 'user-foobar',
            oauthProxy: true
        };

        var APP_2 = {
            id: 'app2',
            appStoreId: '',
            manifest: { version: '0.1.0' },
            location: 'test2',
            portBindings: {},
            accessRestriction: 'user-' + USER_0.id,
            oauthProxy: true
        };

        // unknown app
        var CLIENT_0 = {
            id: 'cid-client0',
            appId: 'appid-app0',
            type: clientdb.TYPE_OAUTH,
            clientSecret: 'secret0',
            redirectURI: 'http://redirect0',
            scope: 'profile'
        };

        // unknown app through addon
        var CLIENT_1 = {
            id: 'cid-client1',
            appId: 'appid-app1',
            type: clientdb.TYPE_OAUTH,
            clientSecret: 'secret1',
            redirectURI: 'http://redirect1',
            scope: 'profile'
        };

        // known app
        var CLIENT_2 = {
            id: 'cid-client2',
            appId: APP_0.id,
            type: clientdb.TYPE_OAUTH,
            clientSecret: 'secret2',
            redirectURI: 'http://redirect2',
            scope: 'profile'
        };

        // known app through addon
        var CLIENT_3 = {
            id: 'cid-client3',
            appId: APP_0.id,
            type: clientdb.TYPE_OAUTH,
            clientSecret: 'secret3',
            redirectURI: 'http://redirect1',
            scope: 'profile'
        };

        // unknown app through proxy
        var CLIENT_4 = {
            id: 'cid-client4',
            appId: 'appid-app4',
            type: clientdb.TYPE_PROXY,
            clientSecret: 'secret4',
            redirectURI: 'http://redirect4',
            scope: 'profile'
        };

        // known app through proxy
        var CLIENT_5 = {
            id: 'cid-client5',
            appId: APP_0.id,
            type: clientdb.TYPE_PROXY,
            clientSecret: 'secret5',
            redirectURI: 'http://redirect5',
            scope: 'profile'
        };

        // app with accessRestriction not allowing user
        var CLIENT_6 = {
            id: 'cid-client6',
            appId: APP_1.id,
            type: clientdb.TYPE_SIMPLE_AUTH,
            clientSecret: 'secret6',
            redirectURI: 'http://redirect6',
            scope: 'profile'
        };

        // app with accessRestriction allowing user
        var CLIENT_7 = {
            id: 'cid-client7',
            appId: APP_2.id,
            type: clientdb.TYPE_SIMPLE_AUTH,
            clientSecret: 'secret7',
            redirectURI: 'http://redirect7',
            scope: 'profile'
        };

        // make csrf always succeed for testing
        oauth2.csrf = function (req, res, next) {
            req.csrfToken = function () { return hat(256); };
            next();
        };

        function setup(done) {
            async.series([
                server.start,
                database._clear,
                clientdb.add.bind(null, CLIENT_0.id, CLIENT_0.appId, CLIENT_0.type, CLIENT_0.clientSecret, CLIENT_0.redirectURI, CLIENT_0.scope),
                clientdb.add.bind(null, CLIENT_1.id, CLIENT_1.appId, CLIENT_1.type, CLIENT_1.clientSecret, CLIENT_1.redirectURI, CLIENT_1.scope),
                clientdb.add.bind(null, CLIENT_2.id, CLIENT_2.appId, CLIENT_2.type, CLIENT_2.clientSecret, CLIENT_2.redirectURI, CLIENT_2.scope),
                clientdb.add.bind(null, CLIENT_3.id, CLIENT_3.appId, CLIENT_3.type, CLIENT_3.clientSecret, CLIENT_3.redirectURI, CLIENT_3.scope),
                clientdb.add.bind(null, CLIENT_4.id, CLIENT_4.appId, CLIENT_4.type, CLIENT_4.clientSecret, CLIENT_4.redirectURI, CLIENT_4.scope),
                clientdb.add.bind(null, CLIENT_5.id, CLIENT_5.appId, CLIENT_5.type, CLIENT_5.clientSecret, CLIENT_5.redirectURI, CLIENT_5.scope),
                clientdb.add.bind(null, CLIENT_6.id, CLIENT_6.appId, CLIENT_6.type, CLIENT_6.clientSecret, CLIENT_6.redirectURI, CLIENT_6.scope),
                clientdb.add.bind(null, CLIENT_7.id, CLIENT_7.appId, CLIENT_7.type, CLIENT_7.clientSecret, CLIENT_7.redirectURI, CLIENT_7.scope),
                appdb.add.bind(null, APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0.accessRestriction, APP_0.oauthProxy),
                appdb.add.bind(null, APP_1.id, APP_1.appStoreId, APP_1.manifest, APP_1.location, APP_1.portBindings, APP_1.accessRestriction, APP_1.oauthProxy),
                appdb.add.bind(null, APP_2.id, APP_2.appStoreId, APP_2.manifest, APP_2.location, APP_2.portBindings, APP_2.accessRestriction, APP_2.oauthProxy),
                function (callback) {
                    user.create(USER_0.username, USER_0.password, USER_0.email, true, '', function (error, userObject) {
                        expect(error).to.not.be.ok();

                        // update the global objects to reflect the new user id
                        USER_0.id = userObject.id;
                        APP_2.accessRestriction = 'user-foobar,user-' + userObject.id;

                        appdb.update(APP_2.id, APP_2, callback);
                    });
                },
            ], done);
        }

        function cleanup(done) {
            database._clear(function (error) {
                expect(error).to.not.be.ok();

                server.stop(done);
            });
        }

        describe('authorization', function () {
            before(setup);
            after(cleanup);

            it('fails due to missing redirect_uri param', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text.indexOf('<!-- error tester -->')).to.not.equal(-1);
                    expect(result.text.indexOf('Invalid request. redirect_uri query param is not set.')).to.not.equal(-1);
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });

            it('fails due to missing client_id param', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text.indexOf('<!-- error tester -->')).to.not.equal(-1);
                    expect(result.text.indexOf('Invalid request. client_id query param is not set.')).to.not.equal(-1);
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });

            it('fails due to missing response_type param', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect&client_id=someclientid')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text.indexOf('<!-- error tester -->')).to.not.equal(-1);
                    expect(result.text.indexOf('Invalid request. response_type query param is not set.')).to.not.equal(-1);
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });

            it('fails for unkown grant type', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect&client_id=someclientid&response_type=foobar')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text.indexOf('<!-- error tester -->')).to.not.equal(-1);
                    expect(result.text.indexOf('Invalid request. Only token and code response types are supported.')).to.not.equal(-1);
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });

            it('succeeds for grant type code', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect&client_id=someclientid&response_type=code')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=http://someredirect";</script>');
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });

            it('succeeds for grant type token', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect&client_id=someclientid&response_type=token')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=http://someredirect";</script>');
                    expect(result.statusCode).to.equal(200);
                    done();
                });
            });
        });

        describe('loginForm', function () {
            before(setup);
            after(cleanup);

            it('fails without prior authentication call and not returnTo query', function (done) {
                superagent.get(SERVER_URL + '/api/v1/session/login')
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text.indexOf('<!-- error tester -->')).to.not.equal(-1);
                    expect(result.text.indexOf('Invalid login request. No returnTo provided.')).to.not.equal(-1);
                    expect(result.statusCode).to.equal(200);

                    done();
                });
            });

            it('redirects without prior authentication call', function (done) {
                superagent.get(SERVER_URL + '/api/v1/session/login?returnTo=http://someredirect')
                .redirects(0)
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(302);
                    expect(result.headers.location).to.eql('http://someredirect');

                    done();
                });
            });

            it('fails due to unknown missing client_id', function (done) {
                superagent.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect&response_type=code')
                .redirects(0)
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.text.indexOf('<!-- error tester -->')).to.not.equal(-1);
                    expect(result.text.indexOf('Invalid request. client_id query param is not set.')).to.not.equal(-1);
                    expect(result.statusCode).to.equal(200);

                    done();
                });
            });

            it('fails due to unknown oauth client', function (done) {
                request.get(SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=http://someredirect&client_id=someclientid&response_type=code', { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=http://someredirect";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=http://someredirect', { jar: true }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- error tester -->')).to.not.equal(-1);
                        expect(body.indexOf('Unknown OAuth client')).to.not.equal(-1);

                        done();
                    });
                });
            });

            it('fails due to unknown app', function (done) {
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_0.redirectURI + '&client_id=' + CLIENT_0.id + '&response_type=code';
                request.get(url, { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_0.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_0.redirectURI, { jar: true, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);
                        expect(response.headers.location).to.eql(CLIENT_0.redirectURI);

                        done();
                    });
                });
            });

            it('fails due to unknown app for addon', function (done) {
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_1.redirectURI + '&client_id=' + CLIENT_1.id + '&response_type=code';
                request.get(url, { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_1.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_1.redirectURI, { jar: true, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);
                        expect(response.headers.location).to.eql(CLIENT_1.redirectURI);

                        done();
                    });
                });
            });

            it('succeeds for known app', function (done) {
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';
                request.get(url, { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI, { jar: true, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        done();
                    });
                });
            });

            it('succeeds for known app for addon', function (done) {
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_3.redirectURI + '&client_id=' + CLIENT_3.id + '&response_type=code';
                request.get(url, { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_3.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_3.redirectURI, { jar: true, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        done();
                    });
                });
            });

            it('fails due to unknown app for proxy', function (done) {
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_4.redirectURI + '&client_id=' + CLIENT_4.id + '&response_type=code';
                request.get(url, { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_4.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_4.redirectURI, { jar: true, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);
                        expect(response.headers.location).to.eql(CLIENT_4.redirectURI);

                        done();
                    });
                });
            });

            it('succeeds for known app for proxy', function (done) {
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_5.redirectURI + '&client_id=' + CLIENT_5.id + '&response_type=code';
                request.get(url, { jar: true }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_5.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_5.redirectURI, { jar: true, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        done();
                    });
                });
            });
        });

        describe('loginForm submit', function () {
            before(setup);
            after(cleanup);

            function startAuthorizationFlow(client, callback) {
                var jar = request.jar();
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + client.redirectURI + '&client_id=' + client.id + '&response_type=code';

                request.get(url, { jar: jar }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + client.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + client.redirectURI, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        callback(jar);
                    });
                });
            }

            it('fails due to missing credentials', function (done) {
                startAuthorizationFlow(CLIENT_2, function (jar) {
                    var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                    var data = {};

                    request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.error).to.eql('Invalid username or password');
                        expect(tmp.query.returnTo).to.eql('/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code');

                        done();
                    });
                });
            });

            it('fails due to wrong username', function (done) {
                startAuthorizationFlow(CLIENT_2, function (jar) {
                    var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                    var data = {
                        username: 'foobar',
                        password: USER_0.password
                    };

                    request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.error).to.eql('Invalid username or password');
                        expect(tmp.query.returnTo).to.eql('/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code');

                        done();
                    });
                });
            });

            it('fails due to wrong password', function (done) {
                startAuthorizationFlow(CLIENT_2, function (jar) {
                    var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                    var data = {
                        username: USER_0.username,
                        password: 'password'
                    };

                    request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.error).to.eql('Invalid username or password');
                        expect(tmp.query.returnTo).to.eql('/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code');

                        done();
                    });
                });
            });

            it('succeeds with username', function (done) {
                startAuthorizationFlow(CLIENT_2, function (jar) {
                    var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                    var data = {
                        username: USER_0.username,
                        password: USER_0.password
                    };

                    request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.redirect_uri).to.eql(CLIENT_2.redirectURI);
                        expect(tmp.query.client_id).to.eql(CLIENT_2.id);
                        expect(tmp.query.response_type).to.eql('code');

                        done();
                    });
                });
            });

            it('succeeds with email', function (done) {
                startAuthorizationFlow(CLIENT_2, function (jar) {
                    var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                    var data = {
                        username: USER_0.email,
                        password: USER_0.password
                    };

                    request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.redirect_uri).to.eql(CLIENT_2.redirectURI);
                        expect(tmp.query.client_id).to.eql(CLIENT_2.id);
                        expect(tmp.query.response_type).to.eql('code');

                        done();
                    });
                });
            });
        });

        describe('authorization with valid session', function () {
            before(setup);
            after(cleanup);

            function startAuthorizationFlow(client, grant, callback) {
                var jar = request.jar();
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + client.redirectURI + '&client_id=' + client.id + '&response_type=' + grant;

                request.get(url, { jar: jar }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + client.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + client.redirectURI, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        var url = SERVER_URL + '/api/v1/session/login?returnTo=' + client.redirectURI;
                        var data = {
                            username: USER_0.username,
                            password: USER_0.password
                        };

                        request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(302);

                            var tmp = urlParse(response.headers.location, true);
                            expect(tmp.query.redirect_uri).to.eql(client.redirectURI);
                            expect(tmp.query.client_id).to.eql(client.id);
                            expect(tmp.query.response_type).to.eql(grant);

                            callback(jar);
                        });
                    });
                });
            }

            it('succeeds for grant type code', function (done) {
                startAuthorizationFlow(CLIENT_2, 'code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        done();
                    });
                });
            });

            it('succeeds for grant type token', function (done) {
                startAuthorizationFlow(CLIENT_2, 'token', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=token';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');

                        var foo = querystring.parse(tmp.hash.slice(1)); // remove #
                        expect(foo.access_token).to.be.a('string');
                        expect(foo.token_type).to.eql('Bearer');

                        done();
                    });
                });
            });

            it('fails for grant type code due to accessRestriction', function (done) {
                startAuthorizationFlow(CLIENT_6, 'code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_6.redirectURI + '&client_id=' + CLIENT_6.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- error tester -->')).to.not.equal(-1);
                        expect(body.indexOf('No access to this app.')).to.not.equal(-1);

                        done();
                    });
                });
            });

            it('succeeds for grant type code with accessRestriction', function (done) {
                startAuthorizationFlow(CLIENT_7, 'code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_7.redirectURI + '&client_id=' + CLIENT_7.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.redirectURI).to.eql(CLIENT_7.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        done();
                    });
                });
            });

            it('fails for grant type token due to accessRestriction', function (done) {
                startAuthorizationFlow(CLIENT_6, 'token', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_6.redirectURI + '&client_id=' + CLIENT_6.id + '&response_type=token';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- error tester -->')).to.not.equal(-1);
                        expect(body.indexOf('No access to this app.')).to.not.equal(-1);

                        done();
                    });
                });
            });

            it('succeeds for grant type token', function (done) {
                startAuthorizationFlow(CLIENT_7, 'token', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_7.redirectURI + '&client_id=' + CLIENT_7.id + '&response_type=token';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.query.redirectURI).to.eql(CLIENT_7.redirectURI + '/');

                        var foo = querystring.parse(tmp.hash.slice(1)); // remove #
                        expect(foo.access_token).to.be.a('string');
                        expect(foo.token_type).to.eql('Bearer');

                        done();
                    });
                });
            });

            it('fails after logout', function (done) {
                startAuthorizationFlow(CLIENT_2, 'token', function (jar) {

                    request.get(SERVER_URL + '/api/v1/session/logout', { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);
                        expect(response.headers.location).to.eql('/');

                        var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=token';
                        request.get(url, { jar: jar }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(200);
                            expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI + '";</script>');

                            done();
                        });
                    });
                });
            });

            it('fails after logout width redirect', function (done) {
                startAuthorizationFlow(CLIENT_2, 'token', function (jar) {

                    request.get(SERVER_URL + '/api/v1/session/logout', { jar: jar, followRedirect: false, qs: { redirect: 'http://foobar' } }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);
                        expect(response.headers.location).to.eql('http://foobar');

                        var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=token';
                        request.get(url, { jar: jar }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(200);
                            expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI + '";</script>');

                            done();
                        });
                    });
                });
            });
        });

        describe('callback', function () {
            before(setup);
            after(cleanup);

            function startAuthorizationFlow(grant, callback) {
                var jar = request.jar();
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=' + grant;

                request.get(url, { jar: jar }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                        var data = {
                            username: USER_0.username,
                            password: USER_0.password
                        };

                        request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(302);

                            var tmp = urlParse(response.headers.location, true);
                            expect(tmp.query.redirect_uri).to.eql(CLIENT_2.redirectURI);
                            expect(tmp.query.client_id).to.eql(CLIENT_2.id);
                            expect(tmp.query.response_type).to.eql(grant);

                            callback(jar);
                        });
                    });
                });
            }

            it('sends correct redirect', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        done();
                    });
                });
            });

            it('is rendered correctly', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- callback tester -->')).to.not.equal(-1);

                        done();
                    });
                });
            });
        });

        describe('token exchange', function () {
            before(setup);
            after(cleanup);

            function startAuthorizationFlow(grant, callback) {
                var jar = request.jar();
                var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=' + grant;

                request.get(url, { jar: jar }, function (error, response, body) {
                    expect(error).to.not.be.ok();
                    expect(response.statusCode).to.eql(200);
                    expect(body).to.eql('<script>window.location.href = "/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI + '";</script>');

                    request.get(SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(200);
                        expect(body.indexOf('<!-- login tester -->')).to.not.equal(-1);

                        var url = SERVER_URL + '/api/v1/session/login?returnTo=' + CLIENT_2.redirectURI;
                        var data = {
                            username: USER_0.username,
                            password: USER_0.password
                        };

                        request.post({ url: url, jar: jar, form: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(302);

                            var tmp = urlParse(response.headers.location, true);
                            expect(tmp.query.redirect_uri).to.eql(CLIENT_2.redirectURI);
                            expect(tmp.query.client_id).to.eql(CLIENT_2.id);
                            expect(tmp.query.response_type).to.eql(grant);

                            callback(jar);
                        });
                    });
                });
            }

            it('fails due to missing credentials', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(401);

                            done();
                        });
                    });
                });
            });

            it('fails due to missing client_id', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            grant_type: 'authorization_code',
                            code: tmp.query.code,
                            // client_id: CLIENT_2.id,
                            client_secret: CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(401);
                            done();
                        });
                    });
                });
            });

            it('fails due to missing grant_type', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            // grant_type: 'authorization_code',
                            code: tmp.query.code,
                            client_id: CLIENT_2.id,
                            client_secret: CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(501);
                            done();
                        });
                    });
                });
            });

            it('fails due to missing code', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            grant_type: 'authorization_code',
                            // code: tmp.query.code,
                            client_id: CLIENT_2.id,
                            client_secret: CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(400);
                            done();
                        });
                    });
                });
            });

            it('fails due to missing client_secret', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            grant_type: 'authorization_code',
                            code: tmp.query.code,
                            client_id: CLIENT_2.id,
                            // client_secret: CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(401);
                            done();
                        });
                    });
                });
            });

            it('fails due to wrong client_secret', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            grant_type: 'authorization_code',
                            code: tmp.query.code,
                            client_id: CLIENT_2.id,
                            client_secret: CLIENT_2.clientSecret+CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(401);
                            done();
                        });
                    });
                });
            });

            it('fails due to wrong client_id', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            grant_type: 'authorization_code',
                            code: tmp.query.code,
                            client_id: CLIENT_2.id+CLIENT_2.id,
                            client_secret: CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(401);
                            done();
                        });
                    });
                });
            });

            it('succeeds', function (done) {
                startAuthorizationFlow('code', function (jar) {
                    var url = SERVER_URL + '/api/v1/oauth/dialog/authorize?redirect_uri=' + CLIENT_2.redirectURI + '&client_id=' + CLIENT_2.id + '&response_type=code';

                    request.get(url, { jar: jar, followRedirect: false }, function (error, response, body) {
                        expect(error).to.not.be.ok();
                        expect(response.statusCode).to.eql(302);

                        var tmp = urlParse(response.headers.location, true);
                        expect(tmp.pathname).to.eql('/api/v1/session/callback');
                        expect(tmp.query.redirectURI).to.eql(CLIENT_2.redirectURI + '/');
                        expect(tmp.query.code).to.be.a('string');

                        var data = {
                            grant_type: 'authorization_code',
                            code: tmp.query.code,
                            client_id: CLIENT_2.id,
                            client_secret: CLIENT_2.clientSecret
                        };

                        request.post(SERVER_URL + '/api/v1/oauth/token', { jar: jar, json: data }, function (error, response, body) {
                            expect(error).to.not.be.ok();
                            expect(response.statusCode).to.eql(200);
                            expect(body.access_token).to.be.a('string');
                            expect(body.token_type).to.eql('Bearer');

                            done();
                        });
                    });
                });
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

