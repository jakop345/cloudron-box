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
    os = require('os');

var assert = require('assert');
var expect = require('expect.js');

var USERNAME = 'nobody';
var EMAIL = 'nobody@no.body';
var PASSWORD = 'foobar';
var VOLUME = 'test_volume';
var VOLUME_2 = 'second_volume';
var VOLUME_3 = 'third_volume';

var basePath = os.tmpdir();

var config = {
    port: 3000,
    dataRoot: path.resolve(path.join(basePath, '/yellowtent/data')),
    configRoot: path.resolve(path.join(basePath, '/yellowtent/config')),
    mountRoot: path.resolve(path.join(basePath, '/yellowtent/mount'))
};

function cleanup(done) {
    exec('rm -rf ' + config.dataRoot, {}, function (error, stdout, stderr) {
        exec('rm -rf ' + config.configRoot, {}, function (error, stdout, stderr) {
            exec('rm -rf ' + config.mountRoot, {}, function (error, stdout, stderr) {
                done();
            });
        });
    });
}

describe('Volume', function () {
    before(function (done) {
        cleanup(function() {
            mkdirp.sync(config.dataRoot);
            mkdirp.sync(config.configRoot);
            mkdirp.sync(config.mountRoot);

            console.log(config);

            done();
        });
    });

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

