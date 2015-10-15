/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../appdb.js'),
    authcodedb = require('../authcodedb.js'),
    clientdb = require('../clientdb.js'),
    hat = require('hat'),
    database = require('../database'),
    DatabaseError = require('../databaseerror.js'),
    expect = require('expect.js'),
    async = require('async'),
    settingsdb = require('../settingsdb.js'),
    tokendb = require('../tokendb.js'),
    userdb = require('../userdb.js');

describe('database', function () {
    before(function (done) {
        async.series([
            database.initialize,
            database._clear
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    describe('userdb', function () {
        var USER_0 = {
            id: 'uuid213',
            username: 'uuid213',
            password: 'secret',
            email: 'safe@me.com',
            admin: false,
            salt: 'morton',
            createdAt: 'sometime back',
            modifiedAt: 'now',
            resetToken: hat(256)
        };

        var ADMIN_0 = {
            id: 'uuid456',
            username: 'uuid456',
            password: 'secret',
            email: 'safe2@me.com',
            admin: true,
            salt: 'tata',
            createdAt: 'sometime back',
            modifiedAt: 'now',
            resetToken: ''
        };

        it('can add user', function (done) {
            userdb.add(USER_0.id, USER_0, function (error) {
                expect(!error).to.be.ok();
                done();
            });
        });

        it('can add admin user', function (done) {
            userdb.add(ADMIN_0.id, ADMIN_0, function (error) {
                expect(!error).to.be.ok();
                done();
            });
        });

        it('cannot add same user again', function (done) {
            userdb.add(USER_0.id, USER_0, function (error) {
                expect(error).to.be.ok();
                expect(error.reason).to.be(DatabaseError.ALREADY_EXISTS);
                done();
            });
        });

        it('can get by user id', function (done) {
            userdb.get(USER_0.id, function (error, user) {
                expect(error).to.not.be.ok();
                expect(user).to.eql(USER_0);
                done();
            });
        });

        it('can get by user name', function (done) {
            userdb.getByUsername(USER_0.username, function (error, user) {
                expect(error).to.not.be.ok();
                expect(user).to.eql(USER_0);
                done();
            });
        });

        it('can get by email', function (done) {
            userdb.getByEmail(USER_0.email, function (error, user) {
                expect(error).to.not.be.ok();
                expect(user).to.eql(USER_0);
                done();
            });
        });

        it('can get by resetToken fails for empty resetToken', function (done) {
            userdb.getByResetToken('', function (error, user) {
                expect(error).to.be.ok();
                expect(error.reason).to.be(DatabaseError.INTERNAL_ERROR);
                expect(user).to.not.be.ok();
                done();
            });
        });

        it('can get by resetToken', function (done) {
            userdb.getByResetToken(USER_0.resetToken, function (error, user) {
                expect(error).to.not.be.ok();
                expect(user).to.eql(USER_0);
                done();
            });
        });

        it('can get all', function (done) {
            userdb.getAll(function (error, all) {
                expect(error).to.not.be.ok();
                expect(all.length).to.equal(2);
                expect(all[0]).to.eql(USER_0);
                expect(all[1]).to.eql(ADMIN_0);
                done();
            });
        });

        it('can get all admins', function (done) {
            userdb.getAllAdmins(function (error, all) {
                expect(error).to.not.be.ok();
                expect(all.length).to.equal(1);
                expect(all[0]).to.eql(ADMIN_0);
                done();
            });
        });

        it('counts the users', function (done) {
            userdb.count(function (error, count) {
                expect(error).to.not.be.ok();
                expect(count).to.equal(2);
                done();
            });
        });

        it('counts the admin users', function (done) {
            userdb.adminCount(function (error, count) {
                expect(error).to.not.be.ok();
                expect(count).to.equal(1);
                done();
            });
        });

        it('can update the user', function (done) {
            userdb.update(USER_0.id, { email: 'some@thing.com' }, function (error) {
                expect(error).to.not.be.ok();
                userdb.get(USER_0.id, function (error, user) {
                    expect(user.email).to.equal('some@thing.com');
                    done();
                });
            });
        });

        it('cannot update with null field', function (done) {
            userdb.update(USER_0.id, { email: null }, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('cannot del non-existing user', function (done) {
            userdb.del(USER_0.id + USER_0.id, function (error) {
                expect(error).to.be.ok();
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });

        it('can del existing user', function (done) {
            userdb.del(USER_0.id, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('did remove the user', function (done) {
            userdb.count(function (error, count) {
                expect(count).to.equal(1);
                done();
            });
        });

        it('can clear table', function (done) {
            userdb._clear(function (error) {
                expect(error).to.not.be.ok();
                userdb.count(function (error, count) {
                    expect(error).to.not.be.ok();
                    expect(count).to.equal(0);
                    done();
                });
            });
        });
    });

    describe('authcode', function () {
        var AUTHCODE_0 = {
            authCode: 'authcode-0',
            clientId: 'clientid-0',
            userId: 'userid-0',
            expiresAt: Date.now() + 5000
        };
        var AUTHCODE_1 = {
            authCode: 'authcode-1',
            clientId: 'clientid-1',
            userId: 'userid-1',
            expiresAt: Date.now() + 5000
        };
        var AUTHCODE_2 = {
            authCode: 'authcode-2',
            clientId: 'clientid-2',
            userId: 'userid-2',
            expiresAt: Date.now()
        };

        it('add fails due to missing arguments', function () {
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.userId); }).to.throwError();
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, function () {}); }).to.throwError();
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, function () {}); }).to.throwError();
        });

        it('add succeeds', function (done) {
            authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.userId, AUTHCODE_0.expiresAt, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('add of same authcode fails', function (done) {
            authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.userId, AUTHCODE_0.expiresAt, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.ALREADY_EXISTS);
                done();
            });
        });

        it('get succeeds', function (done) {
            authcodedb.get(AUTHCODE_0.authCode, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an('object');
                expect(result).to.be.eql(AUTHCODE_0);
                done();
            });
        });

        it('get of nonexisting code fails', function (done) {
            authcodedb.get(AUTHCODE_1.authCode, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('get of expired code fails', function (done) {
            authcodedb.add(AUTHCODE_2.authCode, AUTHCODE_2.clientId, AUTHCODE_2.userId, AUTHCODE_2.expiresAt, function (error) {
                expect(error).to.be(null);

                authcodedb.get(AUTHCODE_2.authCode, function (error, result) {
                    expect(error).to.be.a(DatabaseError);
                    expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                    expect(result).to.not.be.ok();
                    done();
                });
            });
        });

        it('delExpired succeeds', function (done) {
            authcodedb.delExpired(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.eql(1);

                authcodedb.get(AUTHCODE_2.authCode, function (error, result) {
                    expect(error).to.be.a(DatabaseError);
                    expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                    expect(result).to.not.be.ok();
                    done();
                });
            });
        });

        it('delete succeeds', function (done) {
            authcodedb.del(AUTHCODE_0.authCode, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('cannot delete previously delete record', function (done) {
            authcodedb.del(AUTHCODE_0.authCode, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });
    });

    describe('token', function () {
        var TOKEN_0 = {
            accessToken: tokendb.generateToken(),
            identifier: tokendb.PREFIX_USER + '0',
            clientId: 'clientid-0',
            expires: Date.now() + 60 * 60000,
            scope: '*'
        };
        var TOKEN_1 = {
            accessToken: tokendb.generateToken(),
            identifier: tokendb.PREFIX_USER + '1',
            clientId: 'clientid-1',
            expires: Number.MAX_SAFE_INTEGER,
            scope: '*'
        };
        var TOKEN_2 = {
            accessToken: tokendb.generateToken(),
            identifier: tokendb.PREFIX_USER + '2',
            clientId: 'clientid-2',
            expires: Date.now(),
            scope: '*'
        };

        it('add fails due to missing arguments', function () {
            expect(function () { tokendb.add(TOKEN_0.accessToken, TOKEN_0.identifier, TOKEN_0.clientId, TOKEN_0.scope); }).to.throwError();
            expect(function () { tokendb.add(TOKEN_0.accessToken, TOKEN_0.identifier, TOKEN_0.clientId, function () {}); }).to.throwError();
            expect(function () { tokendb.add(TOKEN_0.accessToken, TOKEN_0.identifier, function () {}); }).to.throwError();
            expect(function () { tokendb.add(TOKEN_0.accessToken, function () {}); }).to.throwError();
        });

        it('add succeeds', function (done) {
            tokendb.add(TOKEN_0.accessToken, TOKEN_0.identifier, TOKEN_0.clientId, TOKEN_0.expires, TOKEN_0.scope, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('add of same token fails', function (done) {
            tokendb.add(TOKEN_0.accessToken, TOKEN_0.identifier, TOKEN_0.clientId, TOKEN_0.expires, TOKEN_0.scope, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.ALREADY_EXISTS);
                done();
            });
        });

        it('get succeeds', function (done) {
            tokendb.get(TOKEN_0.accessToken, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an('object');
                expect(result).to.be.eql(TOKEN_0);
                done();
            });
        });

        it('get of nonexisting token fails', function (done) {
            tokendb.get(TOKEN_1.accessToken, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('getByIdentifier succeeds', function (done) {
            tokendb.getByIdentifier(TOKEN_0.identifier, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.equal(1);
                expect(result[0]).to.be.an('object');
                expect(result[0]).to.be.eql(TOKEN_0);
                done();
            });
        });

        it('delete succeeds', function (done) {
            tokendb.del(TOKEN_0.accessToken, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('getByIdentifier succeeds after token deletion', function (done) {
            tokendb.getByIdentifier(TOKEN_0.identifier, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.equal(0);
                done();
            });
        });

        it('delByIdentifier succeeds', function (done) {
            tokendb.add(TOKEN_1.accessToken, TOKEN_1.identifier, TOKEN_1.clientId, TOKEN_1.expires, TOKEN_1.scope, function (error) {
                expect(error).to.be(null);

                tokendb.delByIdentifier(TOKEN_1.identifier, function (error) {
                    expect(error).to.be(null);
                    done();
                });
            });
        });

        it('cannot delete previously delete record', function (done) {
            tokendb.del(TOKEN_0.accessToken, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });

        it('getByIdentifierAndClientId succeeds', function (done) {
            tokendb.add(TOKEN_0.accessToken, TOKEN_0.identifier, TOKEN_0.clientId, TOKEN_0.expires, TOKEN_0.scope, function (error) {
                expect(error).to.be(null);

                tokendb.getByIdentifierAndClientId(TOKEN_0.identifier, TOKEN_0.clientId, function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an(Array);
                    expect(result.length).to.equal(1);
                    expect(result[0]).to.eql(TOKEN_0);
                    done();
                });
            });
        });

        it('delExpired succeeds', function (done) {
            tokendb.add(TOKEN_2.accessToken, TOKEN_2.identifier, TOKEN_2.clientId, TOKEN_2.expires, TOKEN_2.scope, function (error) {
                expect(error).to.be(null);

                tokendb.delExpired(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.eql(1);

                    tokendb.get(TOKEN_2.accessToken, function (error, result) {
                        expect(error).to.be.a(DatabaseError);
                        expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                        expect(result).to.not.be.ok();
                        done();
                    });
                });
            });
        });

        it('delByIdentifierAndClientId succeeds', function (done) {
            tokendb.delByIdentifierAndClientId(TOKEN_0.identifier, TOKEN_0.clientId, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('get of previously deleted token fails', function (done) {
            tokendb.get(TOKEN_0.accessToken, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });
    });

    describe('app', function () {
        var APP_0 = {
            id: 'appid-0',
            appStoreId: 'appStoreId-0',
            dnsRecordId: null,
            installationState: appdb.ISTATE_PENDING_INSTALL,
            installationProgress: null,
            runState: null,
            location: 'some-location-0',
            manifest: { version: '0.1', dockerImage: 'docker/app0', healthCheckPath: '/', httpPort: 80, title: 'app0' },
            httpPort: null,
            containerId: null,
            portBindings: { port: 5678 },
            health: null,
            accessRestriction: '',
            oauthProxy: false,
            lastBackupId: null,
            lastBackupConfig: null,
            oldConfig: null
        };
        var APP_1 = {
            id: 'appid-1',
            appStoreId: 'appStoreId-1',
            dnsRecordId: null,
            installationState: appdb.ISTATE_PENDING_INSTALL, // app health tests rely on this initial state
            installationProgress: null,
            runState: null,
            location: 'some-location-1',
            manifest: { version: '0.2', dockerImage: 'docker/app1', healthCheckPath: '/', httpPort: 80, title: 'app1' },
            httpPort: null,
            containerId: null,
            portBindings: { },
            health: null,
            accessRestriction: '',
            oauthProxy: true,
            lastBackupId: null,
            lastBackupConfig: null,
            oldConfig: null
        };

        it('add fails due to missing arguments', function () {
            expect(function () { appdb.add(APP_0.id, APP_0.manifest, APP_0.installationState, function () {}); }).to.throwError();
            expect(function () { appdb.add(APP_0.id, function () {}); }).to.throwError();
        });

        it('exists returns false', function (done) {
            appdb.exists(APP_0.id, function (error, exists) {
                expect(error).to.be(null);
                expect(exists).to.be(false);
                done();
            });
        });

        it('add succeeds', function (done) {
            appdb.add(APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0.accessRestriction, APP_0.oauthProxy, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('exists succeeds', function (done) {
            appdb.exists(APP_0.id, function (error, exists) {
                expect(error).to.be(null);
                expect(exists).to.be(true);
                done();
            });
        });

        it('getPortBindings succeeds', function (done) {
            appdb.getPortBindings(APP_0.id, function (error, bindings) {
                expect(error).to.be(null);
                expect(bindings).to.be.an(Object);
                expect(bindings).to.be.eql({ port: '5678' });
                done();
            });
        });

        it('add of same app fails', function (done) {
            appdb.add(APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, [ ], APP_0.accessRestriction, APP_0.oauthProxy, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.ALREADY_EXISTS);
                done();
            });
        });

        it('get succeeds', function (done) {
            appdb.get(APP_0.id, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an('object');
                expect(result).to.be.eql(APP_0);
                done();
            });
        });

        it('get of nonexisting code fails', function (done) {
            appdb.get(APP_1.id, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('update succeeds', function (done) {
            APP_0.installationState = 'some-other-status';
            APP_0.location = 'some-other-location';
            APP_0.manifest.version = '0.2';
            APP_0.accessRestriction = '';
            APP_0.oauthProxy = true;
            APP_0.httpPort = 1337;

            var data = {
                installationState: APP_0.installationState,
                location: APP_0.location,
                manifest: APP_0.manifest,
                accessRestriction: APP_0.accessRestriction,
                oauthProxy: APP_0.oauthProxy,
                httpPort: APP_0.httpPort
            };

            appdb.update(APP_0.id, data, function (error) {
                expect(error).to.be(null);

                appdb.get(APP_0.id, function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result).to.be.eql(APP_0);
                    done();
                });
            });
        });

        it('getByHttpPort succeeds', function (done) {
            appdb.getByHttpPort(APP_0.httpPort, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an('object');
                expect(result).to.be.eql(APP_0);
                done();
            });
        });

        it('update of nonexisting app fails', function (done) {
            appdb.update(APP_1.id, { installationState: APP_1.installationState, location: APP_1.location }, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });

        it('add second app succeeds', function (done) {
            appdb.add(APP_1.id, APP_1.appStoreId, APP_1.manifest, APP_1.location, [ ], APP_1.accessRestriction, APP_0.oauthProxy, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('getAll succeeds', function (done) {
            appdb.getAll(function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.be(2);
                expect(result[0]).to.be.eql(APP_0);
                expect(result[1]).to.be.eql(APP_1);
                done();
            });
        });

        it('getAppStoreIds succeeds', function (done) {
            appdb.getAppStoreIds(function (error, results) {
                expect(error).to.be(null);
                expect(results).to.be.an(Array);
                expect(results.length).to.be(2);
                expect(results[0].appStoreId).to.equal(APP_0.appStoreId);
                expect(results[1].appStoreId).to.equal(APP_1.appStoreId);
                done();
            });
        });

        it('delete succeeds', function (done) {
            appdb.del(APP_0.id, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('getPortBindings should be empty', function (done) {
            appdb.getPortBindings(APP_0.id, function (error, bindings) {
                expect(error).to.be(null);
                expect(bindings).to.be.an(Object);
                expect(bindings).to.be.eql({ });
                done();
            });
        });

        it('cannot delete previously delete record', function (done) {
            appdb.del(APP_0.id, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });

        it('cannot set app as healthy because app is not installed', function (done) {
            appdb.setHealth(APP_1.id, appdb.HEALTH_HEALTHY, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('cannot set app as healthy because app has pending run state', function (done) {
            appdb.update(APP_1.id, { runState: appdb.RSTATE_PENDING_STOP, installationState: appdb.ISTATE_INSTALLED }, function (error) {
                expect(error).to.be(null);

                appdb.setHealth(APP_1.id, appdb.HEALTH_HEALTHY, function (error) {
                    expect(error).to.be.ok();
                    done();
                });
            });
        });

        it('cannot set app as healthy because app has null run state', function (done) {
            appdb.update(APP_1.id, { runState: null, installationState: appdb.ISTATE_INSTALLED }, function (error) {
                expect(error).to.be(null);

                appdb.setHealth(APP_1.id, appdb.HEALTH_HEALTHY, function (error) {
                    expect(error).to.be.ok();
                    done();
                });
            });
        });

        it('can set app as healthy when installed and no pending runState', function (done) {
            appdb.update(APP_1.id, { runState: appdb.RSTATE_RUNNING, installationState: appdb.ISTATE_INSTALLED }, function (error) {
                expect(error).to.be(null);

                appdb.setHealth(APP_1.id, appdb.HEALTH_HEALTHY, function (error) {
                    expect(error).to.be(null);
                    appdb.get(APP_1.id, function (error, app) {
                        expect(error).to.be(null);
                        expect(app.health).to.be(appdb.HEALTH_HEALTHY);
                        done();
                    });
                });
            });
        });

        it('cannot set health of unknown app', function (done) {
            appdb.setHealth('randomId', appdb.HEALTH_HEALTHY, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('return empty addon config array for invalid app', function (done) {
            appdb.getAddonConfigByAppId('randomid', function (error, results) {
                expect(error).to.be(null);
                expect(results).to.eql([ ]);
                done();
            });
        });

        it('setAddonConfig succeeds', function (done) {
            appdb.setAddonConfig(APP_1.id, 'addonid1', [ 'ENV1=env', 'ENV2=env' ], function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('setAddonConfig succeeds', function (done) {
            appdb.setAddonConfig(APP_1.id, 'addonid2', [ 'ENV3=env' ], function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('getAddonConfig succeeds', function (done) {
            appdb.getAddonConfig(APP_1.id, 'addonid1', function (error, results) {
                expect(error).to.be(null);
                expect(results).to.eql([ 'ENV1=env', 'ENV2=env' ]);
                done();
            });
        });

        it('getAddonConfigByAppId succeeds', function (done) {
            appdb.getAddonConfigByAppId(APP_1.id, function (error, results) {
                expect(error).to.be(null);
                expect(results).to.eql([ 'ENV1=env', 'ENV2=env', 'ENV3=env' ]);
                done();
            });
        });

        it('unsetAddonConfig succeeds', function (done) {
            appdb.unsetAddonConfig(APP_1.id, 'addonid1', function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('unsetAddonConfig did remove configs', function (done) {
            appdb.getAddonConfigByAppId(APP_1.id, function (error, results) {
                expect(error).to.be(null);
                expect(results).to.eql([ 'ENV3=env' ]);
                done();
            });
        });

        it('unsetAddonConfigByAppId succeeds', function (done) {
            appdb.unsetAddonConfigByAppId(APP_1.id, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('unsetAddonConfigByAppId did remove configs', function (done) {
            appdb.getAddonConfigByAppId(APP_1.id, function (error, results) {
                expect(error).to.be(null);
                expect(results).to.eql([ ]);
                done();
            });
        });
    });

    describe('client', function () {
        var CLIENT_0 = {
            id: 'cid-0',
            appId: 'someappid_0',
            clientSecret: 'secret-0',
            redirectURI: 'http://foo.bar',
            scope: '*'

        };
        var CLIENT_1 = {
            id: 'cid-1',
            appId: 'someappid_1',
            clientSecret: 'secret-',
            redirectURI: 'http://foo.bar',
            scope: '*'
        };
        var CLIENT_2 = {
            id: 'cid-2',
            appId: 'someappid_2',
            clientSecret: 'secret-2',
            redirectURI: 'http://foo.bar.baz',
            scope: 'profile,roleUser'
        };

        it('add succeeds', function (done) {
            clientdb.add(CLIENT_0.id, CLIENT_0.appId, CLIENT_0.clientSecret, CLIENT_0.redirectURI, CLIENT_0.scope, function (error) {
                expect(error).to.be(null);

                clientdb.add(CLIENT_1.id, CLIENT_1.appId, CLIENT_1.clientSecret, CLIENT_1.redirectURI, CLIENT_1.scope, function (error) {
                    expect(error).to.be(null);
                    done();
                });
            });
        });

        it('add same client id fails', function (done) {
            clientdb.add(CLIENT_0.id, CLIENT_0.appId, CLIENT_0.clientSecret, CLIENT_0.redirectURI, CLIENT_0.scope, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.equal(DatabaseError.ALREADY_EXISTS);
                done();
            });
        });

        it('get succeeds', function (done) {
            clientdb.get(CLIENT_0.id, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.eql(CLIENT_0);
                done();
            });
        });

        it('getByAppId succeeds', function (done) {
            clientdb.getByAppId(CLIENT_0.appId, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.eql(CLIENT_0);
                done();
            });
        });

        it('getByAppId fails for unknown client id', function (done) {
            clientdb.getByAppId(CLIENT_0.appId + CLIENT_0.appId, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('getAll succeeds', function (done) {
            clientdb.getAll(function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.equal(3); // one of them is webadmin
                expect(result[0]).to.eql(CLIENT_0);
                expect(result[1]).to.eql(CLIENT_1);
                done();
            });
        });

        it('update client fails due to unknown client id', function (done) {
            clientdb.update(CLIENT_2.id, CLIENT_2.appId, CLIENT_2.clientSecret, CLIENT_2.redirectURI, CLIENT_2.scope, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                done();
            });
        });

        it('update client succeeds', function (done) {
            clientdb.update(CLIENT_1.id, CLIENT_2.appId, CLIENT_2.clientSecret, CLIENT_2.redirectURI, CLIENT_2.scope, function (error) {
                expect(error).to.be(null);

                clientdb.get(CLIENT_1.id, function (error, result) {
                    expect(error).to.be(null);
                    expect(result.appId).to.eql(CLIENT_2.appId);
                    expect(result.clientSecret).to.eql(CLIENT_2.clientSecret);
                    expect(result.redirectURI).to.eql(CLIENT_2.redirectURI);
                    expect(result.scope).to.eql(CLIENT_2.scope);
                    done();
                });
            });
        });

        it('delByAppId succeeds', function (done) {
            clientdb.delByAppId(CLIENT_0.appId, function (error) {
                expect(error).to.be(null);

                clientdb.getByAppId(CLIENT_0.appId, function (error, result) {
                    expect(error).to.be.a(DatabaseError);
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    expect(result).to.not.be.ok();
                    done();
                });
            });
        });
    });

    describe('settings', function () {
        it('can set value', function (done) {
            settingsdb.set('somekey', 'somevalue', function (error) {
                expect(error).to.be(null);
                done();
            });
        });
        it('can get the set value', function (done) {
            settingsdb.get('somekey', function (error, value) {
                expect(error).to.be(null);
                expect(value).to.be('somevalue');
                done();
            });
        });
        it('can get all values', function (done) {
            settingsdb.getAll(function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(Array);
                expect(result[0].name).to.be('somekey');
                expect(result[0].value).to.be('somevalue');
                expect(result.length).to.be(1); // the value set above
                done();
            });
        });
        it('can update a value', function (done) {
            settingsdb.set('somekey', 'someothervalue', function (error) {
                expect(error).to.be(null);
                done();
            });
        });
        it('can get updated value', function (done) {
            settingsdb.get('somekey', function (error, value) {
                expect(error).to.be(null);
                expect(value).to.be('someothervalue');
                done();
            });
        });

    });
});

