/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global after:false */
/* global before:false */

'use strict';

var expect = require('expect.js'),
    path = require('path'),
    shell = require('../shell.js');

describe('shell', function () {
    it('can run valid program', function (done) {
        var cp = shell.exec('test', 'ls', [ '-l' ], function (error) {
            expect(cp).to.be.ok();
            expect(error).to.be(null);
            done();
        });
    });

    it('fails on invalid program', function (done) {
        var cp = shell.exec('test', 'randomprogram', [ ], function (error) {
            expect(error).to.be.ok();
            done();
        });
    });

    it('fails on failing program', function (done) {
        var cp = shell.exec('test', '/usr/bin/false', [ ], function (error) {
            expect(error).to.be.ok();
            done();
        });
    });

    it('cannot sudo invalid program', function (done) {
        var cp = shell.sudo('test', [ 'randomprogram' ], function (error) {
            expect(error).to.be.ok();
            done();
        });
    });

    it('can sudo valid program', function (done) {
        var RELOAD_NGINX_CMD = path.join(__dirname, '../src/scripts/reloadnginx.sh');
        var cp = shell.sudo('test', [ RELOAD_NGINX_CMD ], function (error) {
            expect(error).to.be.ok();
            done();
        });
    });
});

