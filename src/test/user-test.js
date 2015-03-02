/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var config = require('../../config.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    paths = require('../paths.js'),
    user = require('../user.js'),
    userdb = require('../userdb.js'),
    UserError = user.UserError;

var USERNAME = 'nobody';
var USERNAME_NEW = 'nobodynew';
var EMAIL = 'nobody@no.body';
var EMAIL_NEW = 'nobodynew@no.body';
var PASSWORD = 'foobar';
var NEW_PASSWORD = 'somenewpassword';
var IS_ADMIN = true;

function cleanupUsers(done) {
    userdb._clear(function () {
        done();
    });
}

function createUser(done) {
    user.create(USERNAME, PASSWORD, EMAIL, IS_ADMIN, function (error, result) {
        expect(error).to.not.be.ok();
        expect(result).to.be.ok();
        done();
    });
}

function setup(done) {
    // ensure data/config/mount paths
    database.initialize(function (error) {
        expect(error).to.be(null);
        done();
    });
}

function cleanup(done) {
    database._clear(done);
}

describe('User', function () {
    before(setup);
    after(cleanup);

    describe('create', function() {
        before(cleanupUsers);
        after(cleanupUsers);

        it('succeeds', function (done) {
            user.create(USERNAME, PASSWORD, EMAIL, IS_ADMIN, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                expect(result.username).to.equal(USERNAME);
                expect(result.email).to.equal(EMAIL);

                done();
            });
        });

        it('fails because of invalid BAD_FIELD', function (done) {
            expect(function () {
                user.create(EMAIL, {}, function () {});
            }).to.throwException();
            expect(function () {
                user.create(12345, PASSWORD, EMAIL, function () {});
            }).to.throwException();
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, {});
            }).to.throwException();
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, {}, function () {});
            }).to.throwException();
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, {});
            }).to.throwException();

            done();
        });

        it('fails because user exists', function (done) {
            user.create(USERNAME, PASSWORD, EMAIL, IS_ADMIN, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.ALREADY_EXISTS);

                done();
            });
        });

        it('fails because password is empty', function (done) {
            user.create(USERNAME, '', EMAIL, IS_ADMIN, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.BAD_PASSWORD);

                done();
            });
        });
    });

    describe('verify', function () {
        before(createUser);
        after(cleanupUsers);

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
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('fails due to wrong password', function (done) {
            user.verify(USERNAME, PASSWORD+PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

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

    describe('verifyWithEmail', function () {
        before(createUser);
        after(cleanupUsers);

        it('fails due to non existing user', function (done) {
            user.verifyWithEmail(EMAIL+EMAIL, PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to empty password', function (done) {
            user.verifyWithEmail(EMAIL, '', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('fails due to wrong password', function (done) {
            user.verifyWithEmail(EMAIL, PASSWORD+PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('succeeds', function (done) {
            user.verifyWithEmail(EMAIL, PASSWORD, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                done();
            });
        });
    });

    describe('retrieving', function () {
        before(createUser);
        after(cleanupUsers);

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

    describe('update', function () {
        before(createUser);
        after(cleanupUsers);

        it('fails due to unknown userid', function (done) {
            user.update(USERNAME+USERNAME, USERNAME_NEW, EMAIL_NEW, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to invalid username', function (done) {
            user.update(USERNAME, '', EMAIL_NEW, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.BAD_USERNAME);

                done();
            });
        });

        it('fails due to invalid email', function (done) {
            user.update(USERNAME, USERNAME_NEW, 'brokenemailaddress', function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.BAD_EMAIL);

                done();
            });
        });

        it('succeeds', function (done) {
            user.update(USERNAME, USERNAME_NEW, EMAIL_NEW, function (error) {
                expect(error).to.not.be.ok();

                user.get(USERNAME, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result.email).to.equal(EMAIL_NEW);
                    expect(result.username).to.equal(USERNAME_NEW);

                    done();
                });
            });
        });
    });

    describe('admin change', function () {
        before(createUser);
        after(cleanupUsers);

        it('fails to remove admin flag of only admin', function (done) {
            user.changeAdmin(USERNAME, false, function (error) {
                expect(error).to.be.an('object');
                done();
            });
        });

        it('make second user admin succeeds', function (done) {
            var user1 = {
                username: 'seconduser',
                password: 'foobar',
                email: 'some@thi.ng'
            };

            user.create(user1.username, user1.password, user1.email, false, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                user.changeAdmin(user1.username, true, function (error) {
                    expect(error).to.not.be.ok();
                    done();
                });
            });
        });

        it('succeeds to remove admin flag of first user', function (done) {
            user.changeAdmin(USERNAME, false, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });
    });

    describe('password change', function () {
        before(createUser);
        after(cleanupUsers);

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
            user.changePassword(USERNAME, 'wrongpassword', NEW_PASSWORD, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('fails due to empty new password', function (done) {
            user.changePassword(USERNAME, PASSWORD, '', function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('fails due to unknown user', function (done) {
            user.changePassword('somerandomuser', PASSWORD, NEW_PASSWORD, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('succeeds', function (done) {
            user.changePassword(USERNAME, PASSWORD, NEW_PASSWORD, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('actually changed the password (unable to login with old pasword)', function (done) {
            user.verify(USERNAME, PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);
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

    describe('resetPasswordByIdentifier', function () {
        before(createUser);
        after(cleanupUsers);

        it('fails due to unkown email', function (done) {
            user.resetPasswordByIdentifier('unknown@mail.com', function (error) {
                expect(error).to.be.an(UserError);
                expect(error.reason).to.eql(UserError.NOT_FOUND);
                done();
            });
        });

        it('fails due to unkown username', function (done) {
            user.resetPasswordByIdentifier('unknown', function (error) {
                expect(error).to.be.an(UserError);
                expect(error.reason).to.eql(UserError.NOT_FOUND);
                done();
            });
        });

        it('succeeds with email', function (done) {
            user.resetPasswordByIdentifier(EMAIL, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with username', function (done) {
            user.resetPasswordByIdentifier(USERNAME, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });
    });
});
