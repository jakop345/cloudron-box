/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../appdb.js'),
    async = require('async'),
    config = require('../config.js'),
    database = require('../database.js'),
    deepExtend = require('deep-extend'),
    expect = require('expect.js'),
    fs = require('fs'),
    nock = require('nock'),
    settings = require('../settings.js'),
    updatechecker = require('../updatechecker.js'),
    _ = require('underscore');

var RELEASE_1 = {
    "sourceTarballUrl": "https://dev-cloudron-releases.s3.amazonaws.com/box-3314658ce81f328462508e14b6d388acf36ca81c.tar.gz",
    "imageId": 100,
    "imageName": "box-dev-2c7a52b-2016-01-22-150657",
    "changelog": [ ],
    "date": "2016-01-23T23:53:01.566Z",
    "author": "Girish Ramakrishnan <girish@cloudron.io>",
    "next": "2.0.0-1"
};

var RELEASE_2_PRERELEASE = {
    "sourceTarballUrl": "https://dev-cloudron-releases.s3.amazonaws.com/box-3314658ce81f328462508e14b6d388acf36ca81c.tar.gz",
    "imageId": 2001,
    "imageName": "box-dev-2c7a52b-2016-01-22-150657",
    "changelog": [ ],
    "upgrade": false,
    "date": "2016-01-23T23:53:01.566Z",
    "author": "Girish Ramakrishnan <girish@cloudron.io>",
    "next": "2.0.0"
};

var RELEASE_2 = {
    "sourceTarballUrl": "https://dev-cloudron-releases.s3.amazonaws.com/box-3314658ce81f328462508e14b6d388acf36ca81c.tar.gz",
    "imageId": 200,
    "imageName": "box-dev-2c7a52b-2016-01-22-150657",
    "changelog": [ ],
    "upgrade": false,
    "date": "2016-01-23T23:53:01.566Z",
    "author": "Girish Ramakrishnan <girish@cloudron.io>",
    "next": null
};

var RELEASES = {
    "1.0.0": RELEASE_1,
    "2.0.0-1": RELEASE_2_PRERELEASE,
    "2.0.0": RELEASE_2
};

describe('updatechecker - checkBoxUpdates', function () {
    before(function (done) {
        config.set('version', '1.0.0');
        config.set('boxVersionsUrl', 'http://localhost:4444/release.json')
        async.series([
            database.initialize
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    it('no updates', function (done) {
        nock.cleanAll();

        var releaseCopy = deepExtend({}, RELEASES);
        releaseCopy['1.0.0'].next = null;

        var scope = nock('http://localhost:4444')
            .get('/release.json')
            .reply(200, releaseCopy);

        updatechecker.checkBoxUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().box).to.be(null);
            done();
        });
    });

    it('new version', function (done) {
        nock.cleanAll();

        var releaseCopy = deepExtend({}, RELEASES);
        delete releaseCopy['2.0.0-1'];
        releaseCopy['1.0.0'].next = '2.0.0';

        var scope = nock('http://localhost:4444')
            .get('/release.json')
            .reply(200, releaseCopy);

        updatechecker.checkBoxUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().box.version).to.be('2.0.0');
            done();
        });
    });

    it('existing version missing offers latest version', function (done) {
        nock.cleanAll();

        var releaseCopy = deepExtend({}, RELEASES);
        delete releaseCopy['1.0.0'];

        var scope = nock('http://localhost:4444')
            .get('/release.json')
            .reply(200, releaseCopy);

        updatechecker.checkBoxUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().box.version).to.be('2.0.0');
            done();
        });
    });

    it('does not offer prerelease', function (done) {
        nock.cleanAll();

        var releaseCopy = deepExtend({}, RELEASES);

        var scope = nock('http://localhost:4444')
            .get('/release.json')
            .reply(200, releaseCopy);

        updatechecker.checkBoxUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().box).to.be(null);
            done();
        });
    });

    it('offers prerelease', function (done) {
        nock.cleanAll();

        settings.setUpdateConfig({ prerelease: true }, function (error) {
            if (error) return done(error);

            var releaseCopy = deepExtend({}, RELEASES);

            var scope = nock('http://localhost:4444')
                .get('/release.json')
                .reply(200, releaseCopy);

            updatechecker.checkBoxUpdates(function (error) {
                expect(!error).to.be.ok();
                expect(updatechecker.getUpdateInfo().box.version).to.be('2.0.0-1');
                done();
            });
        });
    });

    it('bad response offers nothing', function (done) {
        nock.cleanAll();

        var releaseCopy = _.extend({}, RELEASES);

        var scope = nock('http://localhost:4444')
            .get('/release.json')
            .reply(404, releaseCopy);

        updatechecker.checkBoxUpdates(function (error) {
            expect(error).to.be.ok();
            expect(updatechecker.getUpdateInfo().box).to.be(null);
            done();
        });
    });
});

describe('updatechecker - checkAppUpdates', function () {
    var APP_0 = {
        id: 'appid-0',
        appStoreId: 'io.cloudron.app',
        installationState: appdb.ISTATE_PENDING_INSTALL,
        installationProgress: null,
        runState: null,
        location: 'some-location-0',
        manifest: {
            version: '1.0.0', dockerImage: 'docker/app0', healthCheckPath: '/', httpPort: 80, title: 'app0',
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
        accessRestriction: null,
        memoryLimit: 0
    };

    before(function (done) {
        config.set('version', '1.0.0');
        config.set('apiServerOrigin', 'http://localhost:4444');
        async.series([
            database.initialize,
            database._clear,
            appdb.add.bind(null, APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0.accessRestriction, APP_0.memoryLimit)
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    it('no updates', function (done) {
        nock.cleanAll();

        var scope = nock('http://localhost:4444')
            .post('/api/v1/appupdates')
            .reply(200, { appVersions: { 'io.cloudron.app': { manifest: { version: '1.0.0' } } } });

        updatechecker.checkAppUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().apps).to.eql({});
            done();
        });
    });

    it('bad response', function (done) {
        nock.cleanAll();

        var scope = nock('http://localhost:4444')
            .post('/api/v1/appupdates')
            .reply(500, { appVersions: { 'io.cloudron.app': { manifest: { version: '1.0.0' } } } });

        updatechecker.checkAppUpdates(function (error) {
            expect(error).to.be.ok();
            expect(updatechecker.getUpdateInfo().apps).to.eql({});
            done();
        });
    });

    it('missing info', function (done) {
        nock.cleanAll();

        var scope = nock('http://localhost:4444')
            .post('/api/v1/appupdates')
            .reply(200, { appVersions: { 'io.cloudron.app2': { manifest: { version: '1.0.0' } } } });

        updatechecker.checkAppUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().apps).to.eql({});
            done();
        });
    });

    it('offers new version', function (done) {
        nock.cleanAll();

        var scope = nock('http://localhost:4444')
            .post('/api/v1/appupdates')
            .reply(200, { appVersions: { 'io.cloudron.app': { manifest: { version: '2.0.0' } } } });

        updatechecker.checkAppUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().apps).to.eql({ 'appid-0': { manifest: { version: '2.0.0' } } });
            done();
        });
    });

    it('does not offer old version', function (done) {
        nock.cleanAll();

        var scope = nock('http://localhost:4444')
            .post('/api/v1/appupdates')
            .reply(200, { appVersions: { 'io.cloudron.app': { manifest: { version: '0.1.0' } } } });

        updatechecker.checkAppUpdates(function (error) {
            expect(!error).to.be.ok();
            expect(updatechecker.getUpdateInfo().apps).to.eql({ });
            done();
        });
    });
});
