/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var database = require('../database.js'),
    expect = require('expect.js'),
    settings = require('../settings.js');

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

describe('Settings', function () {
    before(setup);
    after(cleanup);

    it('can get default timezone', function (done) {
        settings.getTimeZone(function (error, tz) {
            expect(error).to.be(null);
            expect(tz.length).to.not.be(0);
            done();
        });
    });
    it('can get default autoupdate_pattern', function (done) {
        settings.getAutoupdatePattern(function (error, pattern) {
            expect(error).to.be(null);
            expect(pattern).to.be('00 00 1,3,5,23 * * *');
            done();
        });
    });
    it ('can get default cloudron name', function (done) {
        settings.getCloudronName(function (error, name) {
            expect(error).to.be(null);
            expect(name).to.be('Cloudron');
            done();
        });
    });
    it('can get default cloudron avatar', function (done) {
        settings.getCloudronAvatar(function (error, gravatar) {
            expect(error).to.be(null);
            expect(gravatar).to.be.a(Buffer);
            done();
        });
    });
    it('can get all values', function (done) {
        settings.getAll(function (error, allSettings) {
            expect(error).to.be(null);
            expect(allSettings[settings.TIME_ZONE_KEY]).to.be.a('string');
            expect(allSettings[settings.AUTOUPDATE_PATTERN_KEY]).to.be.a('string');
            expect(allSettings[settings.CLOUDRON_NAME_KEY]).to.be.a('string');
            done();
        });
    });
});
