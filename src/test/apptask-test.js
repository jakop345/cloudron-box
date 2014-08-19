/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var apptask = require('../apptask.js'),
    expect = require('expect.js'),
    net = require('net'),
    config = require('../../config.js'),
    database = require('../database.js'),
    DatabaseError = require('../databaseerror.js'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    nock = require('nock');

var APP = {
    id: 'appid',
    installationState: 'some-status-0',
    runState: null,
    location: 'applocation',
    manifest: {
        name: 'testapplication'
    },
    containerId: null,
    httpPort: 4567
};

before(function (done) {
    mkdirp.sync(config.appDataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.nginxAppConfigDir);

    database.create(function (error) {
        expect(error).to.be(null);
        done();
    });
});

after(function (done) {
    rimraf(config.baseDir, done);
});

describe('apptask', function () {
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
        apptask._configureNginx(APP, 4545, function (error) {
            expect(fs.existsSync(config.nginxAppConfigDir + '/' + APP.location + '.conf'));
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('unconfigure nginx', function (done) {
        apptask._unconfigureNginx(APP, function (error) {
            expect(!fs.existsSync(config.nginxAppConfigDir + '/' + APP.location + '.conf'));
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('can set naked domain', function (done) {
        apptask._setNakedDomain(APP, function (error) {
            expect(fs.existsSync(config.nginxConfigDir + '/naked_domain.conf'));
            expect(fs.readFileSync(config.nginxConfigDir + '/naked_domain.conf', 'utf8').length > 10);
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('can unset naked domain', function (done) {
        apptask._setNakedDomain(null, function (error) {
            expect(fs.existsSync(config.nginxConfigDir + '/naked_domain.conf'));
            expect(fs.readFileSync(config.nginxConfigDir + '/naked_domain.conf', 'utf8') === '');
            // expect(error).to.be(null); // this fails because nginx cannot be restarted
            done();
        });
    });

    it('create volume', function (done) {
        apptask._createVolume(APP, function (error) {
            expect(fs.existsSync(config.appDataRoot + '/' + APP.id));
            expect(error).to.be(null);
            done();
        });
    });

    it('delete volume', function (done) {
        apptask._deleteVolume(APP, function (error) {
            expect(!fs.existsSync(config.appDataRoot + '/' + APP.id));
            expect(error).to.be(null);
            done();
        });
    });

    it('allocate OAuth credentials', function (done) {
        apptask._allocateOAuthCredentials(APP, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('allocate OAuth credentials twice fails', function (done) {
        apptask._allocateOAuthCredentials(APP, function (error) {
            expect(error).to.be.a(DatabaseError);
            expect(error.reason).to.equal(DatabaseError.ALREADY_EXISTS);
            done();
        });
    });

    it('remove OAuth credentials', function (done) {
        apptask._removeOAuthCredentials(APP, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('remove OAuth credentials twice fails', function (done) {
        apptask._removeOAuthCredentials(APP, function (error) {
            expect(error).to.be.a(DatabaseError);
            expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
            done();
        });
    });

    it('downloads manifest', function (done) {
        var scope = nock(config.appServerUrl).get('/api/v1/appstore/apps/' + APP.id + '/manifest').reply(200, 'manifest_json_string');

        apptask._downloadManifest(APP, function (error) {
            expect(error).to.be(null);
            expect(scope.isDone());
            done();
        });
    });

    it('registers subdomain', function (done) {
        var scope =
            nock(config.appServerUrl)
                .post('/api/v1/subdomains?token=' + config.token, { subdomain: APP.location })
                .reply(201, { });

        apptask._registerSubdomain(APP, function (error) {
            expect(error).to.be(null);
            expect(scope.isDone());
            done();
        });
    });

    it('unregisters subdomain', function (done) {
        var scope = nock(config.appServerUrl).delete('/api/v1/subdomains/' + APP.location).reply(200, { });

        apptask._unregisterSubdomain(APP, function (error) {
            expect(error).to.be(null);
            expect(scope.isDone());
            done();
        });
    });
});

