/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../appdb.js'),
    apps = require('../apps.js'),
    AppsError = apps.AppsError,
    async = require('async'),
    config = require('../../config.js'),
    constants = require('../../constants.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    safe = require('safetydance'),
    _ = require('underscore');

describe('Apps', function () {
    var APP_0 = {
        id: 'appid-0',
        appStoreId: 'appStoreId-0',
        installationState: appdb.ISTATE_PENDING_INSTALL,
        installationProgress: null,
        runState: null,
        location: 'some-location-0',
        manifest: { version: '0.1', dockerImage: 'docker/app0', healthCheckPath: '/', httpPort: 80, title: 'app0' },
        httpPort: null,
        containerId: null,
        portBindings: { '1234': '5678' },
        healthy: null,
        accessRestriction: ''
    };

    before(function (done) {
        async.series([
            database.initialize,
            database._clear,
            appdb.add.bind(null, APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0.accessRestriction)
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    describe('validateHostname', function () {
        it('does not allow admin subdomain', function () {
            expect(apps._validateHostname(constants.ADMIN_LOCATION, 'cloudron.us')).to.be.an(Error);
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
                expect(app.iconUrl).to.be(null);
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
                expect(app.iconUrl).to.eql(null);
                expect(app.fqdn).to.eql(APP_0.location + '-' + config.fqdn());
                done();
            });
        });

        it('can getAll', function (done) {
            apps.getAll(function (error, apps) {
                expect(error).to.be(null);
                expect(apps).to.be.an(Array);
                expect(apps[0].id).to.be(APP_0.id);
                expect(apps[0].iconUrl).to.be(null);
                expect(apps[0].fqdn).to.eql(APP_0.location + '-' + config.fqdn());
                done();
            });
        });
    });
});

describe('validateManifest', function () {
    it('errors for non-object', function () {
        expect(function () { apps.validateManifest('garbage'); }).to.throwError();
        expect(function () { apps.validateManifest(null); }).to.throwError();
        expect(function () { apps.validateManifest(); }).to.throwError();
    });

    var manifest = {
        manifestVersion: 1,
        version: '0.1.2',
        dockerImage: 'girish/foo:0.2',
        healthCheckPath: '/',
        httpPort: '23',
        title: 'Awesome app'
    };

    Object.keys(manifest).forEach(function (key) {
        var manifestCopy = _.extend({ }, manifest);
        delete manifestCopy[key];
        it('errors for missing ' + key, function () {
            expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
        });
    });

    new Array(null, [ 23 ], [ "mysql", 34 ], [ null, "mysql" ]).forEach(function (invalidAddon, idx) {
        it('fails for invalid addon testcase ' + idx, function () {
            var manifestCopy = _.extend({ }, manifest);
            manifestCopy.addons = invalidAddon;
            expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
        });
    });

    it('fails for bad version', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.version = '0.2';
        expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad minBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.minBoxVersion = '0.2';
        expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad maxBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.maxBoxVersion = '0.2';
        expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad targetBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.targetBoxVersion = '0.2';
        expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad manifestVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.manifestVersion = 2;
        expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad iconUrl', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.iconUrl = 34;
        expect(apps.validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('succeeds for minimal valid manifest', function () {
        expect(apps.validateManifest(manifest)).to.be(null);
    });

    it('succeeds for maximal valid manifest', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.minBoxVersion = '0.0.1';
        manifestCopy.maxBoxVersion = '1.0.0';
        manifestCopy.targetBoxVersion = '1.0.0';
        manifestCopy.addons = [ "mysql", "postgresql" ];
        manifestCopy.iconUrl = 'https://www.cloudron.us';

        expect(apps.validateManifest(manifestCopy)).to.be(null);
    });
});

