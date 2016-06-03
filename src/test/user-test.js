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

var USERNAME = 'noBody';
var USERNAME_NEW = 'noBodyNew';
var EMAIL = 'noBody@no.body';
var EMAIL_NEW = 'noBodyNew@no.body';
var PASSWORD = 'sTrOnG#$34134';
var NEW_PASSWORD = 'oTHER@#$235';
var DISPLAY_NAME = 'Nobody cares';
var DISPLAY_NAME_NEW = 'Somone cares';
var userObject = null;
var NON_ADMIN_GROUP = 'members';
var AUDIT_SOURCE = { ip: '1.2.3.4' };

function cleanupUsers(done) {
    async.series([
        groupdb._clear,
        userdb._clear,
        mailer._clearMailQueue
    ], done);
}

function createOwner(done) {
    groups.create('admin', function () { // ignore error since it might already exist
        groups.create(NON_ADMIN_GROUP, function () { // ignore error since it might already exist
            user.createOwner(USERNAME, PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                userObject = result;

                done();
            });
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
            user.create(USERNAME, 'Fo$%23', EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to missing upper case password', function (done) {
            user.create(USERNAME, 'thisiseightch%$234arslong', EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to missing numerics in password', function (done) {
            user.create(USERNAME, 'foobaRASDF%', EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to missing special chars in password', function (done) {
            user.create(USERNAME, 'foobaRASDF23423', EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to reserved username', function (done) {
            user.create('admin', PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to reserved username', function (done) {
            user.create('Mailer-Daemon', PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to short username', function (done) {
            user.create('Z', PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to long username', function (done) {
            user.create(new Array(257).fill('Z').join(''), PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('fails due to reserved pattern', function (done) {
            user.create('maybe-app', PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('succeeds and attempts to send invite', function (done) {
            user.createOwner(USERNAME, PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                expect(result.username).to.equal(USERNAME.toLowerCase());
                expect(result.email).to.equal(EMAIL.toLowerCase());

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
            user.create(USERNAME, PASSWORD, EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.ALREADY_EXISTS);

                done();
            });
        });

        it('fails because password is empty', function (done) {
            user.create(USERNAME, '', EMAIL, DISPLAY_NAME, AUDIT_SOURCE, function (error, result) {
                expect(error).to.be.ok();
                expect(result).not.to.be.ok();
                expect(error.reason).to.equal(UserError.BAD_FIELD);

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
                    expect(owner.email).to.be(EMAIL.toLowerCase());
                    done();
                });
            });
        });
    });

    describe('verify', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails due to non existing user', function (done) {
            user.verify('somerandomid', PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to empty password', function (done) {
            user.verify(userObject.id, '', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('fails due to wrong password', function (done) {
            user.verify(userObject.id, PASSWORD+PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('succeeds', function (done) {
            user.verify(userObject.id, PASSWORD, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                done();
            });
        });
    });

    describe('verifyWithUsername', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails due to non existing username', function (done) {
            user.verifyWithUsername(USERNAME+USERNAME, PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to empty password', function (done) {
            user.verifyWithUsername(USERNAME, '', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('fails due to wrong password', function (done) {
            user.verifyWithUsername(USERNAME, PASSWORD+PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);

                done();
            });
        });

        it('succeeds', function (done) {
            user.verifyWithUsername(USERNAME, PASSWORD, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                done();
            });
        });

        it('succeeds for different username case', function (done) {
            user.verifyWithUsername(USERNAME.toUpperCase(), PASSWORD, function (error, result) {
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

        it('succeeds for different email case', function (done) {
            user.verifyWithEmail(EMAIL.toUpperCase(), PASSWORD, function (error, result) {
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
            user.get(userObject.id, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result.id).to.equal(userObject.id);
                expect(result.email).to.equal(EMAIL.toLowerCase());
                expect(result.username).to.equal(USERNAME.toLowerCase());
                expect(result.displayName).to.equal(DISPLAY_NAME);

                done();
            });
        });
    });

    describe('update', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails due to unknown userid', function (done) {
            var data = { username: USERNAME_NEW, email: EMAIL_NEW, displayName: DISPLAY_NAME_NEW };
            user.update(USERNAME, data, AUDIT_SOURCE, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.NOT_FOUND);

                done();
            });
        });

        it('fails due to invalid email', function (done) {
            var data = { username: USERNAME_NEW, email: 'brokenemailaddress', displayName: DISPLAY_NAME_NEW };
            user.update(userObject.id, data, AUDIT_SOURCE, function (error) {
                expect(error).to.be.a(UserError);
                expect(error.reason).to.equal(UserError.BAD_FIELD);

                done();
            });
        });

        it('succeeds', function (done) {
            var data = { username: USERNAME_NEW, email: EMAIL_NEW, displayName: DISPLAY_NAME_NEW };

            user.update(userObject.id, data, AUDIT_SOURCE, function (error) {
                expect(error).to.not.be.ok();

                user.get(userObject.id, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result.email).to.equal(EMAIL_NEW.toLowerCase());
                    expect(result.username).to.equal(USERNAME_NEW.toLowerCase());
                    expect(result.displayName).to.equal(DISPLAY_NAME_NEW);

                    done();
                });
            });
        });

        it('succeeds with same data', function (done) {
            var data = { username: USERNAME_NEW, email: EMAIL_NEW, displayName: DISPLAY_NAME_NEW };

            user.update(userObject.id, data, AUDIT_SOURCE, function (error) {
                expect(error).to.not.be.ok();

                user.get(userObject.id, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result.email).to.equal(EMAIL_NEW.toLowerCase());
                    expect(result.username).to.equal(USERNAME_NEW.toLowerCase());
                    expect(result.displayName).to.equal(DISPLAY_NAME_NEW);

                    done();
                });
            });
        });
    });

    describe('admin change triggers mail', function () {
        before(createOwner);
        after(cleanupUsers);

        var user1 = {
            username: 'seconduser',
            password: 'ASDFkljsf#$^%2354',
            email: 'some@thi.ng'
        };

        it('make second user admin succeeds', function (done) {

            var invitor = { username: USERNAME, email: EMAIL };
            user.create(user1.username, user1.password, user1.email, DISPLAY_NAME, AUDIT_SOURCE, { invitor: invitor }, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                user1.id = result.id;

                user.setGroups(user1.id, [ groups.ADMIN_GROUP_ID ], function (error) {
                    expect(error).to.not.be.ok();

                    // one mail for user creation, one mail for admin change
                    checkMails(2, done);
                });
            });
        });

        it('add user to non admin group does not trigger admin mail', function (done) {
            user.setGroups(user1.id, [ groups.ADMIN_GROUP_ID, NON_ADMIN_GROUP ], function (error) {
                expect(error).to.equal(null);

                checkMails(0, done);
            });
        });

        it('succeeds to remove admin flag', function (done) {
            user.setGroups(user1.id, [ NON_ADMIN_GROUP ], function (error) {
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
                expect(admins[0].username).to.equal(USERNAME.toLowerCase());
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
            user.create(user1.username, user1.password, user1.email, DISPLAY_NAME, AUDIT_SOURCE, { invitor: invitor }, function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.be.ok();

                user1.id = result.id;

                groups.setGroups(user1.id, [ groups.ADMIN_GROUP_ID ], function (error) {
                    expect(error).to.eql(null);

                    user.getAllAdmins(function (error, admins) {
                        expect(error).to.eql(null);
                        expect(admins.length).to.equal(2);
                        expect(admins[0].username).to.equal(USERNAME.toLowerCase());
                        expect(admins[1].username).to.equal(user1.username.toLowerCase());

                        // one mail for user creation one mail for admin change
                        checkMails(1, done);    // FIXME should be 2 for admin change
                    });
                });
            });
        });
    });

    describe('set password', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails due to unknown user', function (done) {
            user.setPassword('doesnotexist', NEW_PASSWORD, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('fails due to empty password', function (done) {
            user.setPassword(userObject.id, '', function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('fails due to invalid password', function (done) {
            user.setPassword(userObject.id, 'foobar', function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('succeeds', function (done) {
            user.setPassword(userObject.id, NEW_PASSWORD, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('actually changed the password (unable to login with old pasword)', function (done) {
            user.verify(userObject.id, PASSWORD, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                expect(error.reason).to.equal(UserError.WRONG_PASSWORD);
                done();
            });
        });

        it('actually changed the password (login with new password)', function (done) {
            user.verify(userObject.id, NEW_PASSWORD, function (error, result) {
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

    describe('remove', function () {
        before(createOwner);
        after(cleanupUsers);

        it('fails for unkown user', function (done) {
            user.remove('unknown', { }, function (error) {
                expect(error.reason).to.be(UserError.NOT_FOUND);
                done();
            });
        });

        it('can remove valid user', function (done) {
            user.remove(userObject.id, { }, function (error) {
                expect(error).to.be(null);
                done();
            });
        });
    });
});
