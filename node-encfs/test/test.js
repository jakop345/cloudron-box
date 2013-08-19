#!/usr/bin/env node

'use strict';

/* global it:false */
/* global describe:false */

var encfs = require('../index.js'),
    async = require('async');

var assert = require('assert');
var expect = require('expect.js');

describe('encfs', function () {
    var volume;

    it('create volume', function (done) {
        encfs.create('test_root', 'test_mnt', 'foobar1337', function (error, result) {
            expect(error).to.not.be.ok();
            expect(result).to.be.ok();

            volume = result;
            done();
        });
    });

    it('check volume is mounted', function (done) {
        volume.isMounted(function (error, result) {
            expect(error).to.not.be.ok();
            expect(result).to.be.ok();
            done();
        });
    });

    it('unmount volume', function (done) {
        volume.unmount(function (error) {
            expect(error).to.not.be.ok();
            done();
        });
    });

    it('check volume is unmounted', function (done) {
        volume.isMounted(function (error, result) {
            expect(error).to.not.be.ok();
            expect(result).to.not.be.ok();
            done();
        });
    });

    it('mount volume', function (done) {
        volume.mount('foobar1337', function (error) {
            expect(error).to.not.be.ok();
            done();
        });
    });

    it('unmount volume', function (done) {
        volume.unmount(function (error) {
            expect(error).to.not.be.ok();
            done();
        });
    });
});
