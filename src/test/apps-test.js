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
    config = require('../config.js'),
    constants = require('../constants.js'),
    database = require('../database.js'),
    expect = require('expect.js');

describe('Apps', function () {
    var APP_0 = {
        id: 'appid-0',
        appStoreId: 'appStoreId-0',
        installationState: appdb.ISTATE_PENDING_INSTALL,
        installationProgress: null,
        runState: null,
        location: 'some-location-0',
        manifest: {
            version: '0.1', dockerImage: 'docker/app0', healthCheckPath: '/', httpPort: 80, title: 'app0',
            tcpPorts: {
                PORT: {
                    description: 'this is a port that i expose',
                    containerPort: '1234'
                }
            }
        },
        httpPort: null,
        containerId: null,
        portBindings: { PORT: 5678 },
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
        it('does not allow invalid host port', function () {
            expect(apps._validatePortBindings({ port: -1 })).to.be.an(Error);
            expect(apps._validatePortBindings({ port: 0 })).to.be.an(Error);
            expect(apps._validatePortBindings({ port: 'text' })).to.be.an(Error);
            expect(apps._validatePortBindings({ port: 65536 })).to.be.an(Error);
            expect(apps._validatePortBindings({ port: 1024 })).to.be.an(Error);
        });

        it('does not allow ports not as part of manifest', function () {
            expect(apps._validatePortBindings({ port: 1567 })).to.be.an(Error);
            expect(apps._validatePortBindings({ port: 1567 }, { port3: null })).to.be.an(Error);
        });

        it('allows valid bindings', function () {
            expect(apps._validatePortBindings({ port: 1025 }, { port: null })).to.be(null);
            expect(apps._validatePortBindings({
                port1: 4033,
                port2: 3242,
                port3: 1234
            }, { port1: null, port2: null, port3: null })).to.be(null);
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

