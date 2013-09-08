'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var user = require('../user.js'),
    UserError = user.UserError,
    os = require('os'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    crypto = require('crypto'),
    rimraf = require('rimraf'),
    db = require('../database.js'),
    assert = require('assert'),
    expect = require('expect.js');

var USERNAME = 'nobody';
var EMAIL = 'nobody@no.body';
var PASSWORD = 'foobar';

var tmpdirname = 'user-test-' + crypto.randomBytes(4).readUInt32LE(0);
var config = {
    port: 3000,
    dataRoot: path.resolve(os.tmpdir(), tmpdirname + '/data'),
    configRoot: path.resolve(os.tmpdir(), tmpdirname + '/config'),
    mountRoot: path.resolve(os.tmpdir(), tmpdirname + '/mount')
};

function cleanupUser(done) {
    user.remove(USERNAME, function () {
        done();
    });
}

function createUser(done) {
    user.create(USERNAME, PASSWORD, EMAIL, {}, function (error, result) {
        done();
    });
}

function setupDatabase(done) {
    // ensure data/config/mount paths
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);

    db.initialize(config);

    done();
}

function cleanupDatabase(done) {
    rimraf(config.dataRoot, function (error) {
        rimraf(config.configRoot, function (error) {
            rimraf(config.mountRoot, function (error) {
                done();
            });
        });
    });
}

describe('User', function () {
    before(setupDatabase);
    after(cleanupDatabase);

    describe('create', function() {
        before(cleanupUser);
        after(cleanupUser);

        it('succeeds', function (done) {
            user.create(USERNAME, PASSWORD, EMAIL, {}, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                expect(result.username).to.equal(USERNAME);
                expect(result.email).to.equal(EMAIL);

                done();
            });
        });

        it('fails because of invalid arguments', function (done) {
            expect(function () {
                user.create(EMAIL, {}, function () {});
            }).to.throwException();
            expect(function () {
                user.create(12345, PASSWORD, EMAIL, {}, function () {});
            }).to.throwException();
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, {});
            }).to.throwException();
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, function () {});
            }).to.throwException();
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, {}, {});
            }).to.throwException();

            done();
        });

        it('fails because user exists', function (done) {
            user.create(USERNAME, PASSWORD, EMAIL, {}, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.ALREADY_EXISTS);

                done();
            });
        });

        it('fails because password is empty', function (done) {
            user.create(USERNAME, '', EMAIL, {}, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.ARGUMENTS);

                done();
            });
        });
    });

    describe("verify", function () {
        before(createUser);
        after(cleanupUser);

        it('fails due to non existing username', function (done) {
            user.verify(USERNAME+USERNAME, PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to empty password', function (done) {
            user.verify(USERNAME, '', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.ARGUMENTS);

                done();
            });
        });

        it('fails due to wrong password', function (done) {
            user.verify(USERNAME, PASSWORD+PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_USER_OR_PASSWORD);

                done();
            });
        });

        it('succeeds', function (done) {
            user.verify(USERNAME, PASSWORD, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                done();
            });
        });
    });
});

