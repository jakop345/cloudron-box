/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var apps = require('../apps.js'),
    appdb = require('../appdb.js'),
    expect = require('expect.js'),
    database = require('../database.js'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    config = require('../../config.js'),
    AppsError = apps.AppsError;

describe('Apps', function () {
    var APP_0 = {
        id: 'appid-0',
        appStoreId: 'appStoreId-0',
        version: null,
        installationState: appdb.ISTATE_PENDING_INSTALL,
        installationProgress: null,
        runState: null,
        location: 'some-location-0',
        manifest: null,
        httpPort: null,
        containerId: null,
        portBindings: { '1234': '5678' },
        healthy: null,
        isPrivate: false
    };

    before(function (done) {
        mkdirp.sync(config.configRoot);

        database.create(function (error) {
            expect(error).to.be(null);
            appdb.add(APP_0.id, APP_0.appStoreId, APP_0.location, APP_0.portBindings, APP_0.isPrivate, done);
        });
    });

    after(function (done) {
        database.uninitialize();
        rimraf.sync(config.baseDir);
        done();
    });

    describe('validateSubdomain', function () {
        it('does not allow admin subdomain', function () {
            expect(apps._validateSubdomain('admin', 'cloudron.us')).to.be.an(Error);
        });

        it('cannot have >63 length subdomains', function () {
            var s = '';
            for (var i = 0; i < 64; i++) s += 's';
            expect(apps._validateSubdomain(s, 'cloudron.us')).to.be.an(Error);
        });

        it('allows only alphanumerics and hypen', function () {
            expect(apps._validateSubdomain('#2r', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateSubdomain('a%b', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateSubdomain('ab_', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateSubdomain('a.b', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateSubdomain('-ab', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateSubdomain('ab-', 'cloudron.us')).to.be.an(Error);
        });

        it('total length cannot exceed 255', function () {
            var s = '';
            for (var i = 0; i < (255 - 'cloudron.us'.length); i++) s += 's';

            expect(apps._validateSubdomain(s, 'cloudron.us')).to.be.an(Error);
        });

        it('allow valid domains', function () {
            expect(apps._validateSubdomain('a', 'cloudron.us')).to.be(null);
            expect(apps._validateSubdomain('a0-x', 'cloudron.us')).to.be(null);
            expect(apps._validateSubdomain('01', 'cloudron.us')).to.be(null);
        });
    });

    describe('validatePortBindings', function () {
        it('does not allow invalid container port', function () {
            expect(apps._validatePortBindings({ '-1': '5000' })).to.be.an(Error);
            expect(apps._validatePortBindings({ '0': '5000' })).to.be.an(Error);
            expect(apps._validatePortBindings({ 'text': '5000' })).to.be.an(Error);
            expect(apps._validatePortBindings({ '65536': '5000' })).to.be.an(Error);
        });

        it('does not allow invalid host port', function () {
            expect(apps._validatePortBindings({ '3000': '-1' })).to.be.an(Error);
            expect(apps._validatePortBindings({ '3000': '0' })).to.be.an(Error);
            expect(apps._validatePortBindings({ '3000': 'text' })).to.be.an(Error);
            expect(apps._validatePortBindings({ '3000': '65536' })).to.be.an(Error);
            expect(apps._validatePortBindings({ '3000': '1024' })).to.be.an(Error);
        });

        it('allows valid bindings', function () {
            expect(apps._validatePortBindings({ '3000': '1025' })).to.be(null);
            expect(apps._validatePortBindings({ '100': '4033', '25': '3242', '553': '1234' })).to.be(null);
        });
    });

    describe('getters', function () {
        it('cannot get invalid app', function (done) {
            apps.get('nope', function (error, app) {
                expect(error).to.be.ok();
                expect(error.reason).to.be(AppsError.NOT_FOUND);
                done();
            });
        });

        it('can get valid app', function (done) {
            apps.get(APP_0.id, function (error, app) {
                expect(error).to.be(null);
                expect(app).to.be.ok();
                expect(app.icon).to.be(null);
                expect(app.fqdn).to.eql(APP_0.location + '-' + config.fqdn);
                done();
            });
        });

        it('cannot getBySubdomain', function (done) {
            apps.getBySubdomain('moang', function (error, app) {
                expect(error).to.be.ok();
                expect(error.reason).to.be(AppsError.NOT_FOUND);
                done();
            });
        });

        it('can getBySubdomain', function (done) {
            apps.getBySubdomain(APP_0.location, function (error, app) {
                expect(error).to.be(null);
                expect(app).to.be.ok();
                expect(app.icon).to.eql(null);
                expect(app.fqdn).to.eql(APP_0.location + '-' + config.fqdn);
                done();
            });
        });

        it('can getAll', function (done) {
            apps.getAll(function (error, apps) {
                expect(error).to.be(null);
                expect(apps).to.be.an(Array);
                expect(apps[0].id).to.be(APP_0.id);
                expect(apps[0].icon).to.be(null);
                expect(apps[0].fqdn).to.eql(APP_0.location + '-' + config.fqdn);
                done();
            });
        });
    });
});

