/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    authcodedb = require('../authcodedb.js'),
    database = require('../database'),
    DatabaseError = require('../databaseerror.js'),
    expect = require('expect.js'),
    janitor = require('../janitor.js'),
    tokendb = require('../tokendb.js');

describe('janitor', function () {
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
        expiresAt: Date.now() - 5000
    };

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
        expires: Date.now() - 1000,
        scope: '*',
    };

    before(function (done) {
        async.series([
            database.initialize,
            database._clear,
            authcodedb.add.bind(null, AUTHCODE_0.authCode, AUTHCODE_0.clientId, AUTHCODE_0.userId, AUTHCODE_0.expiresAt),
            authcodedb.add.bind(null, AUTHCODE_1.authCode, AUTHCODE_1.clientId, AUTHCODE_1.userId, AUTHCODE_1.expiresAt),
            tokendb.add.bind(null, TOKEN_0.accessToken, TOKEN_0.identifier, TOKEN_0.clientId, TOKEN_0.expires, TOKEN_0.scope),
            tokendb.add.bind(null, TOKEN_1.accessToken, TOKEN_1.identifier, TOKEN_1.clientId, TOKEN_1.expires, TOKEN_1.scope)
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    it('can cleanupTokens', function (done) {
        janitor.cleanupTokens(done);
    });

    it('did not remove the non-expired authcode', function (done) {
        authcodedb.get(AUTHCODE_0.authCode, function (error, result) {
            expect(error).to.be(null);
            expect(result).to.be.eql(AUTHCODE_0);
            done();
        });
    });

    it('did remove expired authcode', function (done) {
        authcodedb.get(AUTHCODE_1.authCode, function (error, result) {
            expect(error).to.be.a(DatabaseError);
            expect(error.reason).to.be(DatabaseError.NOT_FOUND);
            expect(result).to.not.be.ok();
            done();
        });
    });

    it('did not remove the non-expired token', function (done) {
        tokendb.get(TOKEN_0.accessToken, function (error, result) {
            expect(error).to.be(null);
            expect(result).to.be.eql(TOKEN_0);
            done();
        });
    });

    it('did remove the non-expired token', function (done) {
        tokendb.get(TOKEN_1.accessToken, function (error, result) {
            expect(error).to.be.a(DatabaseError);
            expect(error.reason).to.be(DatabaseError.NOT_FOUND);
            expect(result).to.not.be.ok();
            done();
        });
    });
});

