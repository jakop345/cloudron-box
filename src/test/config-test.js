/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global after:false */
/* global before:false */

'use strict';

var expect = require('expect.js'),
    fs = require('fs'),
    safe = require('safetydance');

var config = null;

describe('config', function () {
    before(function () {
        delete require.cache[require.resolve('../../config.js')];
        config = require('../../config.js');
    });

    after(function () {
        delete require.cache[require.resolve('../../config.js')];
    });

    it('baseDir is set', function (done) {
        expect(config.baseDir).to.be.ok();
        done();
    });

    it('cloudron.conf generated automatically', function (done) {
        expect(fs.existsSync(config.cloudronConfigFile)).to.be.ok();
        done();
    });

    it('set saves value in file', function (done) {
        config.set('token', 'TOKEN');
        expect(JSON.parse(fs.readFileSync(config.cloudronConfigFile)).token).to.eql('TOKEN');
        done();
    });

    it('set - simple key value', function (done) {
        config.set('token', 'TOKEN');
        expect(config.token).to.eql('TOKEN');
        done();
    });

    it('set - object', function (done) {
        config.set( { fqdn: 'something.com' } );
        expect(config.fqdn).to.eql('something.com');
        done();
    });

    it('throws with bad key', function (done) {
        safe(function () { config.set('random', 'value'); });
        expect(safe.error).to.be.ok();
        safe(function () { config.set({ random: 'value' }); });
        expect(safe.error).to.be.ok();
        done();
    });
});

