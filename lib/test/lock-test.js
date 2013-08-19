'use strict';

/* global it:false */
/* global describe:false */

var Lock = require('../lock'),
    async = require('async');

var assert = require('assert');
var expect = require('expect.js');

describe('lock', function () {
    var lock = new Lock();

    it('should not be locked', function (done) {
        expect(lock.isLocked()).to.not.be.ok();
        done();
    });

    it('run()', function (done) {
        lock.run(function (callback) {
            expect(lock.isLocked()).to.be.ok();
            callback();
        }, done);
    });

    it('should queue', function (done) {
        var sharedVariable = 10;
        // this grabs a lock and sets the above variable after 10ms
        lock.run(function (callback) {
            setTimeout(function () { sharedVariable = 20; callback(); }, 10);
        });

        // this tries to grab the lock too, but will have to wait until the above finishes
        lock.run(function (callback) {
            expect(lock.isLocked()).to.be.ok();
            expect(sharedVariable == 20).to.be.ok();
            callback();
        }, done);
    });
});

