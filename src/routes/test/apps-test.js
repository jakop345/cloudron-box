'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var Server = require('../../server.js'),
    request = require('superagent'),
    expect = require('expect.js'),
    crypto = require('crypto'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    path = require('path'),
    os = require('os'),
    mkdirp = require('mkdirp'),
    uuid = require('node-uuid'),
    userdb = require('../../userdb.js'),
    Repo = require('../../repo.js'),
    async = require('async'),
    hock = require('hock'),
    appdb = require('../../appdb.js'),
    url = require('url'),
    config = require('../../../config.js');

var SERVER_URL = 'http://localhost:' + config.port;

var APP_ID = 'test';
var APP_LOCATION = 'location';

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var server;
var token = null; // authentication token

function setup(done) {
    server = new Server();
    async.series([
        server.start.bind(server),

        userdb.clear,

        function (callback) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                 .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                 .end(function (error, result) { callback(); });
        },

        function (callback) {
            request.post(SERVER_URL + '/api/v1/token')
                .auth(USERNAME, PASSWORD)
                .end(function (error, result) {
                    token = result.body.token;
                    callback();
                });
        }
    ], done);
}

// remove all temporary folders
function cleanup(done) {
    server.stop(function (error) {
        expect(error).to.be(null);
        rimraf(config.baseDir, done);
    });
}

describe('App API', function () {
    before(setup);
    after(cleanup);

    it('app install fails - missing password', function (done) {
        request.post(SERVER_URL + '/api/v1/app/install')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('API call requires user password.');
            done(err);
        });
    });

    it('app install fails - missing app_id', function (done) {
        request.post(SERVER_URL + '/api/v1/app/install')
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('app_id is required');
            done(err);
        });
    });

    it('app install fails - invalid location', function (done) {
        request.post(SERVER_URL + '/api/v1/app/install')
               .query({ access_token: token })
               .send({ app_id: APP_ID, password: PASSWORD, location: '!awesome' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('Subdomain can only contain alphanumerics and hyphen');
            done(err);
        });
    });

    it('app install fails - reserved location', function (done) {
        request.post(SERVER_URL + '/api/v1/app/install')
               .query({ access_token: token })
               .send({ app_id: APP_ID, password: PASSWORD, location: 'admin' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('admin location is reserved');
            done(err);
        });
    });

    it('app install fails - portBindings must be object', function (done) {
        request.post(SERVER_URL + '/api/v1/app/install')
               .query({ access_token: token })
               .send({ app_id: APP_ID, password: PASSWORD, location: APP_LOCATION, portBindings: 23 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('portBindings must be an object');
            done(err);
        });
    });

    it('app install succeeds', function (done) {
        request.post(SERVER_URL + '/api/v1/app/install')
               .query({ access_token: token })
               .send({ app_id: APP_ID, password: PASSWORD, location: APP_LOCATION, portBindings: null })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('can get app status', function (done) {
        request.get(SERVER_URL + '/api/v1/app/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.id).to.eql(APP_ID);
            expect(res.body.installationState).to.be.ok();
            done(err);
         });
    });

    it('cannot get invalid app status', function (done) {
        request.get(SERVER_URL + '/api/v1/app/kubachi')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
         });
    });

    it('can get all apps', function (done) {
        request.get(SERVER_URL + '/api/v1/apps')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.apps).to.be.an('array');
            expect(res.body.apps[0].id).to.eql(APP_ID);
            expect(res.body.apps[0].installationState).to.be.ok();
            done(err);
         });
    });

    it('can get appBySubdomain', function (done) {
        request.get(SERVER_URL + '/api/v1/subdomain/' + APP_LOCATION)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.id).to.eql(APP_ID);
            expect(res.body.installationState).to.be.ok();
            done(err);
        });
    });

    it('cannot get invalid app by Subdomain', function (done) {
        request.get(SERVER_URL + '/api/v1/subdomain/tikaloma')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
        });
    });

    it('cannot uninstall invalid app', function (done) {
        request.post(SERVER_URL + '/api/v1/app/whatever/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
        });
    });

    it('can uninstall app', function (done) {
        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });
});

describe('App installation', function () {
    this.timeout(10000);

    before(setup);
    after(cleanup);

    it('start the hock server', function (done) {
        hock.createHock(parseInt(url.parse(config.appServerUrl).port, 10), function (error, hockServer) {
            if (error) return done(error);
            var manifest = JSON.parse(fs.readFileSync(__dirname + '/test.app', 'utf8'));

            hockServer
                .get('/api/v1/app/' + APP_ID + '/manifest')
                .reply(200, manifest, { 'Content-Type': 'application/json' })
                .post('/api/v1/subdomains?token=' + config.token, { subdomain: 'test' })
                .reply(200, { });
            done();
        });
    });

    var appInfo = null;

    it('can install test app', function (done) {
        var count = 0;
        function checkInstallStatus() {
            request.get(SERVER_URL + '/api/v1/app/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appInfo = res.body; return done(null); }
                if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                if (++count > 20) return done(new Error('Timedout'));
                setTimeout(checkInstallStatus, 400);
            });
        }

        request.post(SERVER_URL + '/api/v1/app/install')
              .query({ access_token: token })
              .send({ app_id: APP_ID, password: PASSWORD, location: APP_LOCATION, portBindings: null })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            checkInstallStatus();
        });
    });

    it('is up and running', function (done) {
        setTimeout(function () {
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.health_check_url)
                .end(function (err, res) {
                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                done();
            });
        }, 2000); // give some time for docker to settle
    });

    it('can uninstall app', function (done) {
        var count = 0;
        function checkUninstallStatus() {
            request.get(SERVER_URL + '/api/v1/app/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                if (res.statusCode === 404) return done(null);
                if (++count > 20) return done(new Error('Timedout'));
                setTimeout(checkInstallStatus, 400);
            });
        }

        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });
});

