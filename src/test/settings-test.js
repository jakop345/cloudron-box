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
            expect(pattern).to.be('00 00 1 * * *');
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
});
