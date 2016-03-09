/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    database = require('../database.js'),
    expect = require('expect.js'),
    groupdb = require('../groupdb.js'),
    groups = require('../groups.js'),
    mailer = require('../mailer.js'),
    user = require('../user.js'),
    userdb = require('../userdb.js'),
    UserError = user.UserError;

var USERNAME = 'nobody';
var USERNAME_NEW = 'nobodynew';
var EMAIL = 'nobody@no.body';
var EMAIL_NEW = 'nobodynew@no.body';
var PASSWORD = 'sTrOnG#$34134';
var NEW_PASSWORD = 'oTHER@#$235';
var DISPLAY_NAME = 'Nobody cares';
var DISPLAY_NAME_NEW = 'Somone cares';
var userObject = null;

function cleanupUsers(done) {
    async.series([
        groupdb._clear,
        userdb._clear,
        mailer._clearMailQueue
    ], done);
}

function createOwner(done) {
    groups.create('admin', function () { // ignore error since it might already exist
        user.createOwner(USERNAME, PASSWORD, EMAIL, DISPLAY_NAME, function (error, result) {
            expect(error).to.not.be.ok();
            expect(result).to.be.ok();

            userObject = result;

            done();
        });
    });
}

function setup(done) {
    async.series([
        database.initialize,
        database._clear,
        mailer._clearMailQueue
    ], done);
}

function cleanup(done) {
    mailer._clearMailQueue();

    database._clear(done);
}

function checkMails(number, done) {
    // mails are enqueued async
    setTimeout(function () {
        expect(mailer._getMailQueue().length).to.equal(number);
        mailer._clearMailQueue();
        done();
    }, 500);
}

describe('User', function () {
    before(setup);
    after(cleanup);

    describe('create', function() {
        before(cleanupUsers);
        after(cleanupUsers);

        it('fails due to short password', function (done) {
            user.create(USERNAME, 'Fo$%23', EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_PASSWORD);

                done();
            });
        });

        it('fails due to missing upper case password', function (done) {
            user.create(USERNAME, 'thisiseightch%$234arslong', EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_PASSWORD);

                done();
            });
        });

        it('fails due to missing numerics in password', function (done) {
            user.create(USERNAME, 'foobaRASDF%', EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_PASSWORD);

                done();
            });
        });

        it('fails due to missing special chars in password', function (done) {
            user.create(USERNAME, 'foobaRASDF23423', EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_PASSWORD);

                done();
            });
        });

        it('succeeds and attempts to send invite', function (done) {
            user.createOwner(USERNAME, PASSWORD, EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                expect(result.username).to.equal(USERNAME);
                expect(result.email).to.equal(EMAIL);

                // first user is owner, do not send mail to admins
                checkMails(0, done);
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
            expect(function () {
                user.create(USERNAME, PASSWORD, EMAIL, false, null, 'foobar');
            }).to.throwException();

            done();
        });

        it('fails because user exists', function (done) {
            user.create(USERNAME, PASSWORD, EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.ALREADY_EXISTS);

                done();
            });
        });

        it('fails because password is empty', function (done) {
            user.create(USERNAME, '', EMAIL, DISPLAY_NAME, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.BAD_PASSWORD);

                done();
            });
        });
    });

    describe('getOwner', function() {
        before(cleanupUsers);
        after(cleanupUsers);

        it('fails because there is no owner', function (done) {
            user.getOwner(function (error) {
                expect(error.reason).to.be(UserError.NOT_FOUND);
                done();
            });
        });

        it('succeeds', function (done) {
            createOwner(function (error) {
                if (error) return done(error);

                user.getOwner(function (error, owner) {
                    expect(error).to.be(null);
                    expect(owner.email).to.be(EMAIL);
                    done();
                });
            });
        });
    });

    describe('verify', function () {
        before(createOwner);
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
        before(createOwner);
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
        before(createOwner);
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
                expect(result.email).to.equal(EMAIL);
                expect(result.username).to.equal(USERNAME);
                expect(result.displayName).to.equal(DISPLAY_NAME);

                done();
            });
        });
    });

    describe('update', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails due to unknown userid', function (done) {
            user.update(USERNAME+USERNAME, USERNAME_NEW, EMAIL_NEW, DISPLAY_NAME_NEW, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to invalid username', function (done) {
            user.update(USERNAME, '', EMAIL_NEW, DISPLAY_NAME_NEW, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.BAD_USERNAME);

                done();
            });
        });

        it('fails due to invalid email', function (done) {
            user.update(USERNAME, USERNAME_NEW, 'brokenemailaddress', DISPLAY_NAME_NEW, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.BAD_EMAIL);

                done();
            });
        });

        it('succeeds', function (done) {
            user.update(USERNAME, USERNAME_NEW, EMAIL_NEW, DISPLAY_NAME_NEW, function (error) {
                expect(error).to.not.be.ok();

                user.get(USERNAME, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result.email).to.equal(EMAIL_NEW);
                    expect(result.username).to.equal(USERNAME_NEW);
                    expect(result.displayName).to.equal(DISPLAY_NAME_NEW);

                    done();
                });
            });
        });

        it('succeeds with same data', function (done) {
            user.update(USERNAME, USERNAME_NEW, EMAIL_NEW, DISPLAY_NAME_NEW, function (error) {
                expect(error).to.not.be.ok();

                user.get(USERNAME, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result.email).to.equal(EMAIL_NEW);
                    expect(result.username).to.equal(USERNAME_NEW);
                    expect(result.displayName).to.equal(DISPLAY_NAME_NEW);

                    done();
                });
            });
        });
    });

    describe('admin change triggers mail', function () {
        before(createOwner);
        after(cleanupUsers);

        it('make second user admin succeeds', function (done) {
            var user1 = {
                username: 'seconduser',
                password: 'ASDFkljsf#$^%2354',
                email: 'some@thi.ng'
            };

            var invitor = { username: USERNAME, email: EMAIL };
            user.create(user1.username, user1.password, user1.email, DISPLAY_NAME, { invitor: invitor }, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                groups.setGroups(user1.username, [ groups.ADMIN_GROUP_ID ], function (error) {
                    expect(error).to.not.be.ok();

                    // one mail for user creation, one mail for admin change
                    checkMails(1, done);
                });
            });
        });

        xit('succeeds to remove admin flag of first user', function (done) {
            groups.setGroups(USERNAME, [], function (error) {
                expect(error).to.eql(null);
                checkMails(1, done);
            });
        });
    });

    describe('get admins', function () {
        before(createOwner);
        after(cleanupUsers);

        it('succeeds for one admins', function (done) {
            user.getAllAdmins(function (error, admins) {
                expect(error).to.eql(null);
                expect(admins.length).to.equal(1);
                expect(admins[0].username).to.equal(USERNAME);
                done();
            });
        });

        it('succeeds for two admins', function (done) {
            var user1 = {
                username: 'seconduser',
                password: 'Adfasdkjf#$%43',
                email: 'some@thi.ng'
            };

            var invitor = { username: USERNAME, email: EMAIL };
            user.create(user1.username, user1.password, user1.email, DISPLAY_NAME, { invitor: invitor }, function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.be.ok();

                groups.setGroups(user1.username, [ groups.ADMIN_GROUP_ID ], function (error) {
                    expect(error).to.eql(null);

                    user.getAllAdmins(function (error, admins) {
                        expect(error).to.eql(null);
                        expect(admins.length).to.equal(2);
                        expect(admins[0].username).to.equal(USERNAME);
                        expect(admins[1].username).to.equal(user1.username);

                        // one mail for user creation one mail for admin change
                        checkMails(1, done);    // FIXME should be 2 for admin change
                    });
                });
            });
        });
    });

    describe('password change', function () {
        before(createOwner);
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
        before(createOwner);
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
                checkMails(1, done);
            });
        });

        it('succeeds with username', function (done) {
            user.resetPasswordByIdentifier(USERNAME, function (error) {
                expect(error).to.not.be.ok();
                checkMails(1, done);
            });
        });
    });

    describe('send invite', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails for unknown user', function (done) {
            user.sendInvite('unknown user', function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                checkMails(0, done);
            });
        });

        it('succeeds', function (done) {
            user.sendInvite(userObject.id, function (error) {
                expect(error).to.eql(null);
                checkMails(1, done);
            });
        });
    });
});
