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
            volume.create(VOLUME, USERNAME, EMAIL, PASSWORD, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });

        xit('fails because it already exists', function (done) {
            volume.create(VOLUME, USERNAME, EMAIL, PASSWORD, config, function (error, result) {
                expect(error).not.be.ok();
                expect(result).to.not.be.ok();
                done();
            });
        });

        it('second', function (done) {
            volume.create(VOLUME_2, USERNAME, EMAIL, PASSWORD, config, function (error, result) {
                expect(error).not.to.be.ok();
                expect(result).to.be.ok();
                done();
            });
        });
    });

    describe('get', function () {
        it('succeeds', function () {
            var vol = volume.get(VOLUME, USERNAME, config);
            expect(vol).to.be.ok();
            expect(vol).to.be.an(volume.Volume);
        });

        it('fails, no such volume', function () {
            var vol = volume.get(VOLUME_3, USERNAME, config);
            expect(vol).to.not.be.ok();
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
            volume.destroy(VOLUME, USERNAME, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });

        it('fails, no such volume', function (done) {
            volume.destroy(VOLUME, USERNAME, config, function (error) {
                expect(error).to.be.ok();
                done();
            });
        });

        it('second volume', function (done) {
            volume.destroy(VOLUME_2, USERNAME, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });
    });

    describe('object', function () {
        var vol;

        before(function (done) {
            volume.create(VOLUME_3, USERNAME, EMAIL, PASSWORD, config, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result).to.be.an(volume.Volume);

                vol = result;

                done();
            });
        });

        after(function (done) {
            volume.destroy(VOLUME_3, USERNAME, config, function (error) {
                expect(error).not.to.be.ok();
                done();
            });
        });

        it('open', function (done) {
            vol.open(PASSWORD, function (error) {
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
            vol.open(PASSWORD, function (error) {
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
    });
});
