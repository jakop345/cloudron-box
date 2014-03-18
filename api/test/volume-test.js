'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var volume = require('../volume.js'),
    db = require('../database.js'),
    User = require('../user'),
    VolumeError = volume.VolumeError,
    path = require('path'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    crypto = require('crypto'),
    expect = require('expect.js'),
    os = require('os');

var USER;
var USERNAME = 'nobody';
var EMAIL = 'nobody@no.body';
var PASSWORD = 'foobar';
var VOLUME = 'test_volume';
var VOLUME_2 = 'second_volume';
var VOLUME_3 = 'third_volume';

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

    db.initialize(config);

    User.create(USERNAME, PASSWORD, EMAIL, {}, function (error, result) {
        expect(error).to.not.be.ok();
        expect(result).to.be.ok();

        USER = result;

        done();
    });
}

describe('Volume', function () {
    var vol1, vol2;

    before(setup);

    after(function (done) {
        vol1.destroy(USER, PASSWORD, function (error) {
            expect(error).to.not.be.ok();

            vol2.destroy(USER, PASSWORD, function (error) {
                expect(error).to.not.be.ok();

                rimraf.sync(tmpdir);
                done();
            });
        });
    });

    describe('create', function () {

        it('succeeds', function (done) {
            volume.create(VOLUME, USER, PASSWORD, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();

                // will be cleaned up in after();
                vol1 = result;

                done();
            });
        });

        it('fails because it already exists', function (done) {
            volume.create(VOLUME, USER, PASSWORD, config, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('second', function (done) {
            volume.create(VOLUME_2, USER, USER.password, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();

                // will be cleaned up in after();
                vol2 = result;

                done();
            });
        });
    });

    describe('get by id', function () {
        it('succeeds', function (done) {
            volume.get(vol1.id, USERNAME, config, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result).to.be.an(volume.Volume);
                done();
            });
        });

        it('fails, no such volume', function () {
            volume.get('some string', USERNAME, config, function (error, result) {
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

    describe('get by name', function () {
        it('fails, no such volume', function () {
            volume.getByName('some string', USERNAME, config, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
            });
        });

        it('succeeds', function (done) {
            volume.getByName(VOLUME, USERNAME, config, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result).to.be.an(volume.Volume);
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

        it('fails to destroy, due to wrong password', function (done) {
            vol.destroy(USER, 'some wrong password', function (error) {
                expect(error).to.be.a(VolumeError);
                done();
            });
        });

        it('can be destroyed', function (done) {
            vol.destroy(USER, PASSWORD, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });
    });


    describe('user management', function () {
        var TEST_VOLUME = 'user-management-test-volume';
        var TEST_USERNAME_0 = 'user0';
        var TEST_USERNAME_1 = 'user1';
        var TEST_PASSWORD_0 = 'password0';
        var TEST_PASSWORD_1 = 'password1';
        var TEST_USER_0;
        var TEST_USER_1;
        var vol;

        before(function (done) {
            this.timeout(5000);
            User.create(TEST_USERNAME_0, TEST_PASSWORD_0, 'xx@xx.xx', {}, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                TEST_USER_0 = result;

                User.create(TEST_USERNAME_1, TEST_PASSWORD_1, 'xx@xx.xx', {}, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();

                    TEST_USER_1 = result;

                    volume.create(TEST_VOLUME, TEST_USER_0, TEST_PASSWORD_0, config, function (error, result) {
                        expect(error).not.to.be.ok();
                        expect(result).to.be.ok();

                        vol = result;

                        done();
                    });
                });
            });

        });

        it('fails to add user due to wrong argument count', function () {
            expect(function () { vol.addUser(); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, TEST_PASSWORD_0); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, TEST_USER_1, TEST_PASSWORD_0); }).to.throwError();
        });

        it('fails to add user due to wrong arguments', function () {
            expect(function () { vol.addUser('some string', TEST_PASSWORD_0, function () {}, 1337); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, 1337, 'foobar', function () {}); }).to.throwError();
            expect(function () { vol.addUser(TEST_USER_0, TEST_PASSWORD_0, 'some string', []); }).to.throwError();
        });

        it('fails to add user with the same user', function (done) {
            vol.addUser(TEST_USER_0, TEST_USER_0, TEST_PASSWORD_0, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('can add user', function (done) {
            vol.addUser(TEST_USER_1, TEST_USER_0, TEST_PASSWORD_0, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        it('fails to add user due to user already has access', function (done) {
            vol.addUser(TEST_USER_1, TEST_USER_0, TEST_PASSWORD_0, function (error, result) {
                expect(error).to.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('can list users', function (done) {
            vol.users(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.an('object');
                expect(result.length).to.be(2);
                expect(result[0]).to.equal(TEST_USERNAME_0);
                expect(result[1]).to.equal(TEST_USERNAME_1);
                done();
            });
        });

        it('fails to remove user due to wrong argument count', function () {
            expect(function () { vol.removeUser(); }).to.throwError();
            expect(function () { vol.removeUser(TEST_USER_1); }).to.throwError();
        });

        it('fails to remove user due to wrong arguments', function () {
            expect(function () { vol.removeUser('some string', function () {}); }).to.throwError();
            expect(function () { vol.removeUser(1337, function () {}); }).to.throwError();
            expect(function () { vol.removeUser(TEST_USER_0, 1337); }).to.throwError();
            expect(function () { vol.removeUser(TEST_USER_0, 'some string'); }).to.throwError();
        });

        it('fails to remove user due to unknown user', function (done) {
            var unknownUser = { username: 'someuser', email: 'xx@xx.xx' };

            vol.removeUser(unknownUser, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('succeeds to remove user', function (done) {
            vol.removeUser(TEST_USER_1, function (error) {
                expect(error).to.not.be.ok();
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
            this.timeout(5000);
            vol.destroy(TEST_USER_0, TEST_PASSWORD_0, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });
    });
});
