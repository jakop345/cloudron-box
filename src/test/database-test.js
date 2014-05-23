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
    var config = {
        port: 3456,
        dataRoot: path.resolve(BASE_DIR, 'data'),
        configRoot: path.resolve(BASE_DIR, 'config'),
        mountRoot: path.resolve(BASE_DIR, 'mount'),
        silent: true
    };

    before(function (done) {
        database.initialize(config, function (error) {
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
        xit('cannot delete previously delete record', function (done) {
            authcodedb.del(AUTHCODE_0.authCode, function (error) {
                expect(error).to.be.a(DatabaseError);
                expect(error.reason).to.be(DatabaseError.NOT_FOUND);
                done();
            });
        });
    });
});

