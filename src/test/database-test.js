/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';


var database = require('../database'),
    path = require('path'),
    os = require('os'),
    rimraf = require('rimraf'),
    crypto = require('crypto'),
    DatabaseError = require('../databaseerror.js'),
    userdb = require('../userdb.js'),
    tokendb = require('../tokendb.js'),
    clientdb = require('../clientdb.js'),
    authcodedb = require('../authcodedb.js'),
    appdb = require('../appdb.js'),
    expect = require('expect.js');

describe('database', function () {
    var BASE_DIR = path.resolve(os.tmpdir(), 'database-test-' + crypto.randomBytes(4).readUInt32LE(0));
    var CONFIG = {
        port: 3456,
        dataRoot: path.resolve(BASE_DIR, 'data'),
        configRoot: path.resolve(BASE_DIR, 'config'),
        mountRoot: path.resolve(BASE_DIR, 'mount'),
        silent: true
    };

    before(function (done) {
        database.initialize(CONFIG, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    after(function (done) {
        rimraf.sync(BASE_DIR);
        done();
    });

    it('remove privates', function () {
        var obj = {
            username: 'username',
            _password: 'password',
            email: 'girs@foc.com',
            _salt: 'morton'
        };
        var result = database.removePrivates(obj);
        expect(result.username).to.equal('username');
        expect(result.email).to.equal('girs@foc.com');
        expect(result._password).to.not.be.ok();
        expect(result._salt).to.not.be.ok();
    });

    describe('authcode', function () {
        var AUTHCODE_0 = {
            authCode: 'authcode-0',
            clientId: 'clientid-0',
            redirectURI: 'http://localhost',
            userId: 'userid-0'
        };
        var AUTHCODE_1 = {
            authCode: 'authcode-1',
            clientId: 'clientid-1',
            redirectURI: 'http://localhost',
            userId: 'userid-1'
        };

        it('add fails due to missing arguments', function () {
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.redirectURI, AUTHCODE_0.userId); }).to.throwError();
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.redirectURI, function () {}); }).to.throwError();
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, function () {}); }).to.throwError();
            expect(function () { authcodedb.add(AUTHCODE_0.authCode, function () {}); }).to.throwError();
        });

        it('add succeeds', function (done) {
            authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.redirectURI, AUTHCODE_0.userId, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('add of same authcode fails', function (done) {
            authcodedb.add(AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.redirectURI, AUTHCODE_0.userId, function (error) {
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

        it('delete succeeds', function (done) {
            authcodedb.del(AUTHCODE_0.authCode, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        // Is this not supported by sqlite??
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
            userId: 'userid-0',
            clientId: 'clientid-0',
            expires: Date.now().toString()
        };
        var TOKEN_1 = {
            accessToken: tokendb.generateToken(),
            userId: 'userid-1',
            clientId: 'clientid-1',
            expires: Date.now().toString()
        };

        it('add fails due to missing arguments', function () {
            expect(function () { tokendb.add(TOKEN_0.accessToken, TOKEN_0.userId, TOKEN_0.clientId); }).to.throwError();
            expect(function () { tokendb.add(TOKEN_0.accessToken, TOKEN_0.userId, function () {}); }).to.throwError();
            expect(function () { tokendb.add(TOKEN_0.accessToken, function () {}); }).to.throwError();
        });

        it('add succeeds', function (done) {
            tokendb.add(TOKEN_0.accessToken, TOKEN_0.userId, TOKEN_0.clientId, TOKEN_0.expires, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('add of same token fails', function (done) {
            tokendb.add(TOKEN_0.accessToken, TOKEN_0.userId, TOKEN_0.clientId, TOKEN_0.expires, function (error) {
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

        it('get of nonexisting code fails', function (done) {
            tokendb.get(TOKEN_1.accessToken, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('getByUserId succeeds', function (done) {
            tokendb.getByUserId(TOKEN_0.userId, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an('object');
                expect(result).to.be.eql(TOKEN_0);
                done();
            });
        });

        it('getByUserId of nonexisting user fails', function (done) {
            tokendb.getByUserId(TOKEN_1.userId, function (error, result) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('delete succeeds', function (done) {
            tokendb.del(TOKEN_0.accessToken, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('delByUserId succeeds', function (done) {
            tokendb.add(TOKEN_1.accessToken, TOKEN_1.userId, TOKEN_1.clientId, TOKEN_1.expires, function (error) {
                expect(error).to.be(null);

                tokendb.delByUserId(TOKEN_1.userId, function (error) {
                    expect(error).to.be(null);
                    done();
                });
            });
        });

        // Is this not supported by sqlite??
        it('cannot delete previously delete record', function (done) {
            tokendb.del(TOKEN_0.accessToken, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });
    });

    describe('app', function () {
        var APP_0 = {
            id: 'appid-0',
            statusCode: 'some-status-0',
            location: 'some-location-0',
            manifestJson: null,
            statusMessage: null,
            httpPort: null,
            containerId: null
        };
        var APP_1 = {
            id: 'appid-1',
            statusCode: 'some-status-1',
            location: 'some-location-1',
            manifestJson: null,
            statusMessage: null,
            httpPort: null,
            containerId: null
        };

        it('add fails due to missing arguments', function () {
            expect(function () { appdb.add(APP_0.id, APP_0.statusCode, function () {}); }).to.throwError();
            expect(function () { appdb.add(APP_0.id, function () {}); }).to.throwError();
        });

        // This needs to be tested in the api layer?
        xit('add fails due to bad arguments', function () {
            expect(function () { appdb.add(APP_0.id, APP_0.statusCode, 'loc', { "5555": "10" }, function () {}); }).to.throwError();
            expect(function () { appdb.add(APP_0.id, APP_0.statusCode, 'loc', { 5555: 10 }, function () {}); }).to.throwError();
            expect(function () { appdb.add(APP_0.id, APP_0.statusCode, 'loc', { "mango": 4000 }, function () {}); }).to.throwError();
            expect(function () { appdb.add(APP_0.id, APP_0.statusCode, 'loc', { "1000": "grape" }, function () {}); }).to.throwError();
        });


        it('add succeeds', function (done) {
            appdb.add(APP_0.id, APP_0.statusCode, APP_0.location, [ { containerPort: 1234, hostPort: 5678 } ], function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('getPortBindings succeeds', function (done) {
            appdb.getPortBindings(APP_0.id, function (error, bindings) {
                expect(error).to.be(null);
                expect(bindings).to.be.an(Array);
                expect(bindings).to.be.eql([ { containerPort: 1234, hostPort: 5678, appId: APP_0.id } ]);
                done();
            });
        });

        it('add of same app fails', function (done) {
            appdb.add(APP_0.id, APP_0.statusCode, APP_0.location, [ ], function (error) {
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
            APP_0.statusCode = 'some-other-status';
            APP_0.location = 'some-other-location';

            appdb.update(APP_0.id, { statusCode: APP_0.statusCode, location: APP_0.location }, function (error) {
                expect(error).to.be(null);

                appdb.get(APP_0.id, function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result).to.be.eql(APP_0);
                    done();
                });
            });
        });

        it('update of nonexisting app fails', function (done) {
            appdb.update(APP_1.id, { statusCode: APP_1.statusCode, location: APP_1.location }, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });

        it('add second app succeeds', function (done) {
            appdb.add(APP_1.id, APP_1.statusCode, APP_1.location, [ ], function (error) {
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

        it('delete succeeds', function (done) {
            appdb.del(APP_0.id, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('getPortBindings should be empty', function (done) {
            appdb.getPortBindings(APP_0.id, function (error, bindings) {
                expect(error).to.be(null);
                expect(bindings).to.be.an(Array);
                expect(bindings).to.be.eql([ ]);
                done();
            });
        });

        // Is this not supported by sqlite??
        it('cannot delete previously delete record', function (done) {
            appdb.del(APP_0.id, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });
    });
});

