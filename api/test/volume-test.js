'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var volume = require('../volume.js'),
    fs = require('fs'),
    path = require('path'),
    exec = require('child_process').exec,
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    crypto = require('crypto'),
    assert = require('assert'),
    expect = require('expect.js'),
    os = require('os');

var USERNAME = 'nobody';
var EMAIL = 'nobody@no.body';
var PASSWORD = 'foobar';
var VOLUME = 'test_volume';
var VOLUME_2 = 'second_volume';
var VOLUME_3 = 'third_volume';

var USER = {
    username: USERNAME,
    password: PASSWORD,
    email: EMAIL
};

var tmpdirname = 'volume-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.resolve(os.tmpdir(), tmpdirname);
var config = {
    port: 3000,
    dataRoot: path.resolve(tmpdir, 'data'),
    configRoot: path.resolve(tmpdir, 'config'),
    mountRoot: path.resolve(tmpdir, 'mount')
};

// ensure data/config/mount paths
function setup(done) {
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);

    done();
}

// remove all temporary folders
function cleanup(done) {
    rimraf(tmpdir, function (error) {
        done();
    });
}

describe('Volume', function () {
    before(setup);
    after(cleanup);

    describe('create', function () {
        it('succeeds', function (done) {
            volume.create(VOLUME, USER, USER.password, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('fails because it already exists', function (done) {
            volume.create(VOLUME, USER, USER.password, config, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('second', function (done) {
            volume.create(VOLUME_2, USER, USER.password, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });
    });

    describe('get', function () {
        it('succeeds', function (done) {
            volume.get(VOLUME, USERNAME, config, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result).to.be.an(volume.Volume);
                done();
            });
        });

        it('fails, no such volume', function () {
            volume.get(VOLUME_3, USERNAME, config, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
            });
        });

        it('list', function (done) {
            volume.list(USERNAME, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                expect(result).to.be.an(Array);
                expect(result.length).to.be.equal(2);
                expect(result[0]).to.be.an(volume.Volume);
                expect(result[1]).to.be.an(volume.Volume);

                done();
            });
        });
    });

    describe('destroy', function () {
        it('first volume', function (done) {
            volume.destroy(VOLUME, USER, USER.password, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });

        it('fails, no such volume', function (done) {
            volume.destroy(VOLUME, USER, USER.password, config, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('second volume', function (done) {
            volume.destroy(VOLUME_2, USER, USER.password, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });
    });

    describe('object', function () {
        var vol;

        before(function (done) {
            volume.create(VOLUME_3, USER, USER.password, config, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result).to.be.an(volume.Volume);

                vol = result;

                done();
            });
        });

        after(function (done) {
            volume.destroy(VOLUME_3, USER, USER.password, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });

        it('is mounted after creation', function (done) {
            vol.isMounted(function (error, isMounted) {
                expect(error).to.not.be.ok();
                expect(isMounted).to.be.ok();
                done();
            });
        });

        it('open', function (done) {
            vol.open(USERNAME, PASSWORD, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('close', function (done) {
            vol.close(function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('open', function (done) {
            vol.open(USERNAME, PASSWORD, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('close', function (done) {
            vol.close(function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('is not mounted', function (done) {
            vol.isMounted(function (error, isMounted) {
                expect(error).to.not.be.ok();
                expect(isMounted).to.not.be.ok();
                done();
            });
        });
    });


    describe('user management', function () {
        var TEST_VOLUME = 'user-management-test-volume';
        var TEST_PASSWORD_0 = 'password0';
        var TEST_PASSWORD_1 = 'password1';
        var TEST_USER_0 = { username: 'user0', email: 'xx@xx.xx', password: TEST_PASSWORD_0 };
        var TEST_USER_1 = { username: 'user1', email: 'xx@xx.xx', password: TEST_PASSWORD_1 };
        var vol = null;

        before(function (done) {
            volume.create(TEST_VOLUME, TEST_USER_0, TEST_USER_0.password, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();

                vol = result;

                done();
            });
        });

        it('fails to add user due to wrong arumgent count', function () {
            expect(function () { vol.addUser(); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, TEST_PASSWORD_0); }).to.throwError();
        });

        it('fails to add user due to wrong arumgents', function () {
            expect(function () { vol.addUser('some string', TEST_PASSWORD_0, function () {}); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, 1337, function () {}); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, TEST_PASSWORD_0, 'some string'); }).to.throwError();
        });

        it('fails to add user with the same user', function (done) {
            vol.addUser(TEST_USER_0, TEST_USER_0, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('can add user', function (done) {
            vol.addUser(TEST_USER_1, TEST_USER_0, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('fails to add user due to user already has access', function (done) {
            vol.addUser(TEST_USER_1, TEST_USER_0, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('fails to change password due to wrong current password', function (done) {
            vol.changeUserPassword(TEST_USER_1, TEST_PASSWORD_0, 'newpassword', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('fails to change password due to empty new password', function (done) {
            vol.changeUserPassword(TEST_USER_1, TEST_PASSWORD_1, '', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('fails to change password due to user not known by volume', function (done) {
            var unknownUser = { username: 'someuser', email: 'xx@xx.xx' };
            vol.changeUserPassword(unknownUser, TEST_PASSWORD_1, 'newpassword', function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('changing password succeeds', function (done) {
            vol.changeUserPassword(TEST_USER_1, TEST_PASSWORD_1, 'newpassword', function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('changing password only changed target user\'s password', function (done) {
            vol.verifyUser(TEST_USER_0, TEST_PASSWORD_0, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('fails to remove user due to wrong arumgent count', function () {
            expect(function () { vol.removeUser(); }).to.throwError();
            expect(function () { vol.removeUser(TEST_USER_1); }).to.throwError();
        });

        it('fails to remove user due to wrong arumgents', function () {
            expect(function () { vol.removeUser('some string', function () {}); }).to.throwError();
            expect(function () { vol.removeUser(1337, function () {}); }).to.throwError();
            expect(function () { vol.removeUser(TEST_USER_0, 1337); }).to.throwError();
            expect(function () { vol.removeUser(TEST_USER_0, 'some string'); }).to.throwError();
        });

        it('fails to remove user due to unknown user', function (done) {
            var unknownUser = { username: 'someuser', email: 'xx@xx.xx' };

            vol.removeUser(unknownUser, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('succeeds to remove user', function (done) {
            vol.removeUser(TEST_USER_1, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('previously removed user does not have access to volume anymore', function (done) {
            // try first old then new password
            vol.verifyUser(TEST_USER_1, TEST_PASSWORD_1, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();

                vol.verifyUser(TEST_USER_1, 'newpassword', function (error, result) {
                    expect(error).to.be.ok();
                    expect(result).to.not.be.ok();

                    done();
                });
            });
        });

        after(function (done) {
            volume.destroy(TEST_VOLUME, TEST_USER_0, TEST_USER_0.password, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });
    });
});
