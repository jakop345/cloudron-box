/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../appdb.js'),
    apps = require('../apps.js'),
    AppsError = apps.AppsError,
    config = require('../../config.js'),
    database = require('../database.js'),
    expect = require('expect.js');

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
        accessRestriction: ''
    };

    before(function (done) {
        database.initialize(function (error) {
            expect(error).to.be(null);
            appdb.add(APP_0.id, APP_0.appStoreId, APP_0.location, APP_0.portBindings, APP_0.accessRestriction, done);
        });
    });

    after(function (done) {
        database.clear(done);
    });

    describe('validateHostname', function () {
        it('does not allow admin subdomain', function () {
            expect(apps._validateHostname('admin', 'cloudron.us')).to.be.an(Error);
        });

        it('cannot have >63 length subdomains', function () {
            var s = '';
            for (var i = 0; i < 64; i++) s += 's';
            expect(apps._validateHostname(s, 'cloudron.us')).to.be.an(Error);
        });

        it('allows only alphanumerics and hypen', function () {
            expect(apps._validateHostname('#2r', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateHostname('a%b', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateHostname('ab_', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateHostname('a.b', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateHostname('-ab', 'cloudron.us')).to.be.an(Error);
            expect(apps._validateHostname('ab-', 'cloudron.us')).to.be.an(Error);
        });

        it('total length cannot exceed 255', function () {
            var s = '';
            for (var i = 0; i < (255 - 'cloudron.us'.length); i++) s += 's';

            expect(apps._validateHostname(s, 'cloudron.us')).to.be.an(Error);
        });

        it('allow valid domains', function () {
            expect(apps._validateHostname('a', 'cloudron.us')).to.be(null);
            expect(apps._validateHostname('a0-x', 'cloudron.us')).to.be(null);
            expect(apps._validateHostname('01', 'cloudron.us')).to.be(null);
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
                expect(app.fqdn).to.eql(APP_0.location + '-' + config.fqdn());
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
                expect(app.fqdn).to.eql(APP_0.location + '-' + config.fqdn());
                done();
            });
        });

        it('can getAll', function (done) {
            apps.getAll(function (error, apps) {
                expect(error).to.be(null);
                expect(apps).to.be.an(Array);
                expect(apps[0].id).to.be(APP_0.id);
                expect(apps[0].icon).to.be(null);
                expect(apps[0].fqdn).to.eql(APP_0.location + '-' + config.fqdn());
                done();
            });
        });
    });
});

