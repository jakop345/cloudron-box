/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global after:false */
/* global before:false */

'use strict';

var expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
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

    it('baseDir() is set', function (done) {
        expect(config.baseDir()).to.be.ok();
        done();
    });

    it('cloudron.conf generated automatically', function (done) {
        expect(fs.existsSync(path.join(config.baseDir(), 'configs/cloudron.conf'))).to.be.ok();
        done();
    });

    it('did set default values', function () {
        expect(config.isCustomDomain()).to.equal(false);
        expect(config.fqdn()).to.equal('localhost');
        expect(config.adminOrigin()).to.equal('https://admin-localhost');
        expect(config.appFqdn('app')).to.equal('app-localhost');
        expect(config.zoneName()).to.equal('localhost');
    });

    it('set saves value in file', function (done) {
        config.set('token', 'TOKEN');
        expect(JSON.parse(fs.readFileSync(path.join(config.baseDir(), 'configs/cloudron.conf'))).token).to.eql('TOKEN');
        done();
    });

    it('set - simple key value', function (done) {
        config.set('token', 'TOKEN');
        expect(config.token()).to.eql('TOKEN');
        done();
    });

    it('set - object', function (done) {
        config.set( { fqdn: 'something.com' } );
        expect(config.fqdn()).to.eql('something.com');
        done();
    });

    it('uses dotted locations with custom domain', function () {
        config.set('fqdn', 'example.com');
        config.set('isCustomDomain', true);

        expect(config.isCustomDomain()).to.equal(true);
        expect(config.fqdn()).to.equal('example.com');
        expect(config.adminOrigin()).to.equal('https://admin.example.com');
        expect(config.appFqdn('app')).to.equal('app.example.com');
        expect(config.zoneName()).to.equal('example.com');
    });

    it('uses hyphen locations with non-custom domain', function () {
        config.set('fqdn', 'test.example.com');
        config.set('isCustomDomain', false);

        expect(config.isCustomDomain()).to.equal(false);
        expect(config.fqdn()).to.equal('test.example.com');
        expect(config.adminOrigin()).to.equal('https://admin-test.example.com');
        expect(config.appFqdn('app')).to.equal('app-test.example.com');
        expect(config.zoneName()).to.equal('example.com');
    });

    it('can set arbitrary values', function (done) {
        config.set('random', 'value');
        expect(config.get('random')).to.equal('value');

        config.set('this.is.madness', 42);
        expect(config.get('this.is.madness')).to.equal(42);

        done();
    });

});

