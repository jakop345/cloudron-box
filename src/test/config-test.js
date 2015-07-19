/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global after:false */
/* global before:false */

'use strict';

var constants = require('../../constants.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    path = require('path');

var config = null;

describe('config', function () {
    before(function () {
        delete require.cache[require.resolve('../config.js')];
        config = require('../config.js');
    });

    after(function () {
        delete require.cache[require.resolve('../config.js')];
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
        expect(config.adminOrigin()).to.equal('https://' + constants.ADMIN_LOCATION + '-localhost');
        expect(config.appFqdn('app')).to.equal('app-localhost');
        expect(config.zoneName()).to.equal('localhost');
    });

    it('set saves value in file', function (done) {
        config.set('foobar', 'somevalue');
        expect(JSON.parse(fs.readFileSync(path.join(config.baseDir(), 'configs/cloudron.conf'))).foobar).to.eql('somevalue');
        done();
    });

    it('set - simple key value', function (done) {
        config.set('foobar', 'somevalue2');
        expect(config.get('foobar')).to.eql('somevalue2');
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
        expect(config.adminOrigin()).to.equal('https://' + constants.ADMIN_LOCATION + '.example.com');
        expect(config.appFqdn('app')).to.equal('app.example.com');
        expect(config.zoneName()).to.equal('example.com');
    });

    it('uses hyphen locations with non-custom domain', function () {
        config.set('fqdn', 'test.example.com');
        config.set('isCustomDomain', false);

        expect(config.isCustomDomain()).to.equal(false);
        expect(config.fqdn()).to.equal('test.example.com');
        expect(config.adminOrigin()).to.equal('https://' + constants.ADMIN_LOCATION + '-test.example.com');
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

