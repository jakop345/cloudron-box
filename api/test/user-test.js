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
    expect = require('expect.js');

var USERNAME = 'nobody';
var EMAIL = 'nobody@no.body';
var PASSWORD = 'foobar';
var NEW_PASSWORD = 'somenewpassword';

var tmpdirname = 'volume-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.resolve(os.tmpdir(), tmpdirname);
var config = {
    port: 3000,
    dataRoot: path.resolve(tmpdir, 'data'),
    configRoot: path.resolve(tmpdir, 'config'),
    mountRoot: path.resolve(tmpdir, 'mount')
};

function cleanupUser(done) {
    user.remove(USERNAME, function () {
        done();
    });
}

function createUser(done) {
    user.create(USERNAME, PASSWORD, EMAIL, {}, function (error, result) {
        expect(error).to.not.be.ok();
        expect(result).to.be.ok();
        done();
    });
}

function setup(done) {
    // ensure data/config/mount paths
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);

    db.initialize(config);

    done();
}

function cleanup(done) {
    rimraf(tmpdir, function (error) {
        expect(error).to.not.be.ok();
        done();
    });
}

describe('User', function () {
    before(setup);
    after(cleanup);

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

    describe('verify', function () {
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

    describe('retrieving', function () {
        before(createUser);
        after(cleanupUser);

        it('fails due to non existing user', function (done) {
            user.get('some non existing username', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();

                done();
            });
        });

        it('succeeds', function (done) {
            user.get(USERNAME, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                done();
            });
        });
    });

    describe('password change', function () {
        before(createUser);
        after(cleanupUser);

        it('fails due to wrong arumgent count', function () {
            expect(function () { user.changePassword(); }).to.throwError();
            expect(function () { user.changePassword(USERNAME); }).to.throwError();
            expect(function () { user.changePassword(USERNAME, PASSWORD, NEW_PASSWORD); }).to.throwError();
        });

        it('fails due to wrong arumgents', function () {
            expect(function () { user.changePassword(USERNAME, {}, NEW_PASSWORD, function () {}); }).to.throwError();
            expect(function () { user.changePassword(1337, PASSWORD, NEW_PASSWORD, function () {}); }).to.throwError();
            expect(function () { user.changePassword(USERNAME, PASSWORD, 1337, function () {}); }).to.throwError();
            expect(function () { user.changePassword(USERNAME, PASSWORD, NEW_PASSWORD, 'some string'); }).to.throwError();
        });

        it('fails due to wrong password', function (done) {
            user.changePassword(USERNAME, 'wrongpassword', NEW_PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('fails due to empty new password', function (done) {
            user.changePassword(USERNAME, PASSWORD, '', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('fails due to unknown user', function (done) {
            user.changePassword('somerandomuser', PASSWORD, NEW_PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('succeeds', function (done) {
            user.changePassword(USERNAME, PASSWORD, NEW_PASSWORD, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('actually changed the password (unable to login with old pasword)', function (done) {
            user.verify(USERNAME, PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_USER_OR_PASSWORD);
                done();
            });
        });

        it('actually changed the password (login with new password)', function (done) {
            user.verify(USERNAME, NEW_PASSWORD, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });
    });
});
