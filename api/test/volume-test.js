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
var config = {
    port: 3000,
    dataRoot: path.resolve(os.tmpdir(), tmpdirname + '/data'),
    configRoot: path.resolve(os.tmpdir(), tmpdirname + '/config'),
    mountRoot: path.resolve(os.tmpdir(), tmpdirname + '/mount')
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
    rimraf(config.dataRoot, function (error) {
        rimraf(config.configRoot, function (error) {
            rimraf(config.mountRoot, function (error) {
                done();
            });
        });
    });
}

describe('Volume', function () {
    before(setup);
    after(cleanup);

    it('create', function (done) {
        volume.create(VOLUME, USERNAME, EMAIL, PASSWORD, config, function (error, result) {
            expect(error).not.to.be.ok();
            expect(result).to.be.ok();
            done();
        });
    });

    it('create second', function (done) {
        volume.create(VOLUME_2, USERNAME, EMAIL, PASSWORD, config, function (error, result) {
            expect(error).not.to.be.ok();
            expect(result).to.be.ok();

            done();
        });
    });

    it('get', function () {
        var vol = volume.get(VOLUME, USERNAME, config);
        expect(vol).to.be.ok();
        expect(vol).to.be.an(volume.Volume);
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

    it('destroy both', function (done) {
        volume.destroy(VOLUME, USERNAME, config, function (error) {
            expect(error).not.to.be.ok();

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
