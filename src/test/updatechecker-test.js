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
    expect = require('expect.js'),
    fs = require('fs'),
    nock = require('nock'),
    settings = require('../settings.js'),
    updatechecker = require('../updatechecker.js'),
    _ = require('underscore');

var RELEASE = {
    "0.7.0": {
        "sourceTarballUrl": "https://dev-cloudron-releases.s3.amazonaws.com/box-3314658ce81f328462508e14b6d388acf36ca81c.tar.gz",
        "imageId": 15436849,
        "imageName": "box-dev-2c7a52b-2016-01-22-150657",
        "changelog": [
        ],
        "upgrade": true,
        "date": "2016-01-23T23:53:01.566Z",
        "author": "Girish Ramakrishnan <girish@cloudron.io>",
        "next": null
    }
};

describe('updatechecker', function () {
    before(function (done) {
        config.set('version', '0.5.0');
        config.set('boxVersionsUrl', 'http://localhost:4444/release.json')
        async.series([
            database.initialize,
            settings.setTlsConfig.bind(null, { provider: 'caas' })
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    it('checkBoxUpdates - no updates', function (done) {
        nock.cleanAll();

        var scope = nock('http://localhost:4444')
            .get('/release.json')
            .reply(200, RELEASE);

        updatechecker.checkBoxUpdates(function (error) {
            expect(!error).to.be.ok();

            expect(updatechecker.getUpdateInfo().box.version).to.be('0.7.0');
            done();
        });
    });
});

