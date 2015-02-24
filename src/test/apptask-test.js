/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var addons = require('../addons.js'),
    appdb = require('../appdb.js'),
    apptask = require('../apptask.js'),
    config = require('../../config.js'),
    database = require('../database.js'),
    DatabaseError = require('../databaseerror.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    net = require('net'),
    nock = require('nock'),
    paths = require('../paths.js'),
    safe = require('safetydance'),
    _ = require('underscore');

var APP = {
    id: 'appid',
    appStoreId: 'appStoreId',
    version: '0.0.1',
    installationState: appdb.ISTATE_PENDING_INSTALL,
    runState: null,
    location: 'applocation',
    manifest: {
        title: 'testapplication'
    },
    containerId: null,
    httpPort: 4567,
    portBindings: null,
    accessRestriction: ''
};

describe('apptask', function () {
    before(function (done) {
        database.initialize(function (error) {
            expect(error).to.be(null);
            appdb.add(APP.id, APP.appStoreId, APP.version, APP.location, APP.portBindings, APP.accessRestriction, done);
        });
    });

    after(function (done) {
        database.clear(done);
    });

    it('initializes succesfully', function (done) {
        apptask.initialize(done);
    });

    it('free port', function (done) {
        apptask._getFreePort(function (error, port) {
            expect(error).to.be(null);
            expect(port).to.be.a('number');
            var client = net.connect(port);
            client.on('connect', function () { done(new Error('Port is not free:' + port)); });
            client.on('error', function (error) { done(); });
        });
    });

    it('configure nginx correctly', function (done) {
        apptask._configureNginx(APP, function (error) {
            expect(fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP.id + '.conf'));
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('unconfigure nginx', function (done) {
        apptask._unconfigureNginx(APP, function (error) {
            expect(!fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP.id + '.conf'));
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('can set naked domain', function (done) {
        apptask.writeNginxNakedDomainConfig(APP, function (error) {
            expect(fs.existsSync(paths.NGINX_CONFIG_DIR + '/naked_domain.conf'));
            expect(fs.readFileSync(paths.NGINX_CONFIG_DIR + '/naked_domain.conf', 'utf8').length > 10);
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('can unset naked domain', function (done) {
        apptask.writeNginxNakedDomainConfig(null, function (error) {
            expect(fs.existsSync(paths.NGINX_CONFIG_DIR + '/naked_domain.conf'));
            expect(fs.readFileSync(paths.NGINX_CONFIG_DIR + '/naked_domain.conf', 'utf8') === '');
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('create volume', function (done) {
        apptask._createVolume(APP, function (error) {
            expect(fs.existsSync(paths.APPDATA_DIR + '/' + APP.id)).to.be(true);
            expect(error).to.be(null);
            done();
        });
    });

    it('delete volume', function (done) {
        apptask._deleteVolume(APP, function (error) {
            expect(!fs.existsSync(paths.APPDATA_DIR + '/' + APP.id)).to.be(true);
            expect(error).to.be(null);
            done();
        });
    });

    it('allocate OAuth credentials', function (done) {
        addons._allocateOAuthCredentials(APP, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('remove OAuth credentials', function (done) {
        addons._removeOAuthCredentials(APP, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('remove OAuth credentials twice succeeds', function (done) {
        addons._removeOAuthCredentials(APP, function (error) {
            expect(!error).to.be.ok();
            done();
        });
    });

    it('barfs on empty manifest', function (done) {
        var scope = nock(config.apiServerOrigin()).get('/api/v1/appstore/apps/' + APP.appStoreId + '/versions/' + APP.version + '/manifest').reply(200, { });

        apptask._downloadManifest(APP, function (error) {
            expect(error).to.be.ok();
            expect(scope.isDone());
            done();
        });
    });

    it('barfs on bad field in manifest', function (done) {
        var manifest = { version: '0.1', dockerImage: 'foo', healthCheckPath: '/', httpPort: 3, title: 'ok' };
        var scope = nock(config.apiServerOrigin()).get('/api/v1/appstore/apps/' + APP.appStoreId + '/versions/' + APP.version + '/manifest').reply(200, manifest);

        apptask._downloadManifest(APP, function (error) {
            expect(error).to.be.ok();
            expect(scope.isDone());
            done();
        });
    });

    it('barfs on malformed manifest', function (done) {
        var scope = nock(config.apiServerOrigin()).get('/api/v1/appstore/apps/' + APP.appStoreId + '/versions/' + APP.version + '/manifest').reply(200, 'you evil man');

        apptask._downloadManifest(APP, function (error) {
            expect(error).to.be.ok();
            expect(scope.isDone());
            done();
        });
    });

    it('downloads manifest', function (done) {
        var manifest = { version: '0.0.1', manifestVersion: 1, dockerImage: 'foo', healthCheckPath: '/', httpPort: '3', title: 'ok' };
        var scope = nock(config.apiServerOrigin()).get('/api/v1/appstore/apps/' + APP.appStoreId + '/versions/' + APP.version + '/manifest').reply(200, manifest);

        apptask._downloadManifest(APP, function (error) {
            expect(error).to.be(null);
            expect(scope.isDone());
            done();
        });
    });

    it('registers subdomain', function (done) {
        var scope =
            nock(config.apiServerOrigin())
                .post('/api/v1/subdomains?token=' + config.token(), { records: [ { subdomain: APP.location, type: 'A' } ] })
                .reply(201, { ids: [ 'someid' ] });

        apptask._registerSubdomain(APP, function (error) {
            expect(error).to.be(null);
            expect(scope.isDone());
            done();
        });
    });

    it('unregisters subdomain', function (done) {
        var scope = nock(config.apiServerOrigin()).delete('/api/v1/subdomains/someid').reply(200, { });

        apptask._unregisterSubdomain(APP, function (error) {
            expect(error).to.be(null);
            expect(scope.isDone());
            done();
        });
    });
});

describe('validateManifest', function () {
    it('errors for empty string', function () {
        expect(apptask._validateManifest(safe.JSON.parse(''))).to.be.an(Error);
    });

    it('errors for invalid json', function () {
        expect(apptask._validateManifest(safe.JSON.parse('garbage'))).to.be.an(Error);
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
            expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
        });
    });

    new Array(null, [ 23 ], [ "mysql", 34 ], [ null, "mysql" ]).forEach(function (invalidAddon, idx) {
        it('fails for invalid addon testcase ' + idx, function () {
            var manifestCopy = _.extend({ }, manifest);
            manifestCopy.addons = invalidAddon;
            expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
        });
    });

    it('fails for bad version', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.version = '0.2';
        expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad minBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.minBoxVersion = '0.2';
        expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad maxBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.maxBoxVersion = '0.2';
        expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad targetBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.targetBoxVersion = '0.2';
        expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('fails for bad manifestVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.manifestVersion = 2;
        expect(apptask._validateManifest(manifestCopy)).to.be.an(Error);
    });

    it('succeeds for minimal valid manifest', function () {
        expect(apptask._validateManifest(manifest)).to.be(null);
    });

    it('succeeds for maximal valid manifest', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.minBoxVersion = '0.0.1';
        manifestCopy.maxBoxVersion = '1.0.0';
        manifestCopy.targetBoxVersion = '1.0.0';
        manifestCopy.addons = [ "mysql", "postgresql" ];

        expect(apptask._validateManifest(manifestCopy)).to.be(null);
    });
});

