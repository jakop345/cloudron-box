'use strict';

/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var Server = require('../../server.js'),
    request = require('superagent'),
    expect = require('expect.js'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    os = require('os'),
    userdb = require('../../userdb.js'),
    async = require('async'),
    hock = require('hock'),
    appdb = require('../../appdb.js'),
    url = require('url'),
    Docker = require('dockerode'),
    net = require('net'),
    config = require('../../../config.js');

var SERVER_URL = 'http://localhost:' + config.port;

var APP_ID = 'test';
var APP_LOCATION = 'location';

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var server;
var docker = os.platform() === 'linux' ? new Docker({socketPath: '/var/run/docker.sock'}) : new Docker({ host: 'http://localhost', port: 2375 });
var token = null; // authentication token

function setup(done) {
    server = new Server();
    async.series([
        server.start.bind(server),

        userdb.clear,

        function (callback) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                 .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                 .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    callback();
                });
        },

        function (callback) {
            request.post(SERVER_URL + '/api/v1/token')
                .auth(USERNAME, PASSWORD)
                .end(function (error, result) {
                    token = result.body.token;
                    config.set('token', 'APPSTORE_TOKEN');
                    callback();
                });
        }
    ], done);
}

// remove all temporary folders
function cleanup(done) {
    server.stop(function (error) {
        expect(error).to.be(null);
        config.set('token', null);
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
        request.get(SERVER_URL + '/api/v1/subdomains/' + APP_LOCATION)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.id).to.eql(APP_ID);
            expect(res.body.installationState).to.be.ok();
            done(err);
        });
    });

    it('cannot get invalid app by Subdomain', function (done) {
        request.get(SERVER_URL + '/api/v1/subdomains/tikaloma')
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
    this.timeout(50000);

    var hockServer;

    before(function (done) {
        setup(function (error) {
            if (error) return done(error);

            hock(parseInt(url.parse(config.appServerUrl).port, 10), function (error, server) {
                if (error) return done(error);
                var manifest = JSON.parse(fs.readFileSync(__dirname + '/test.app', 'utf8'));
                hockServer = server;

                hockServer
                    .get('/api/v1/app/' + APP_ID + '/manifest')
                    .reply(200, manifest, { 'Content-Type': 'application/json' })
                    .post('/api/v1/subdomains?token=' + config.token, { subdomain: APP_LOCATION })
                    .reply(201, { }, { 'Content-Type': 'application/json' })
                    .delete('/api/v1/subdomains/' + APP_LOCATION + '?token=' + config.token)
                    .reply(200, { }, { 'Content-Type': 'application/json' });
                done();
            });
        });
    });

    after(function (done) {
        cleanup(function (error) {
            if (error) return done(error);
            hockServer.close(done);
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
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkInstallStatus, 1000);
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

    it('installation - container created', function (done) {
        expect(appInfo.containerId).to.be.ok();
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Config.ExposedPorts['7777/tcp']).to.eql({ });
            done();
        });
    });

    it('installation - nginx config', function (done) {
        expect(fs.existsSync(config.nginxAppConfigDir + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('installation - registered subdomain', function (done) {
        // this is checked in unregister subdomain testcase
        done();
    });

    it('installation - volume created', function (done) {
        expect(fs.existsSync(config.appDataRoot + '/' + APP_ID));
        done();
    });

    it('installation - is up and running', function (done) {
        setTimeout(function () {
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.health_check_url)
                .end(function (err, res) {
                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                done();
            });
        }, 2000); // give some time for docker to settle
    });

    it('installation - running container has volume mounted', function (done) {
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Volumes['/app/data']).to.eql(config.appDataRoot + '/' + APP_ID);
            done();
        });
    });

    it('can uninstall app', function (done) {
        var count = 0;
        function checkUninstallStatus() {
            request.get(SERVER_URL + '/api/v1/app/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                if (res.statusCode === 404) return done(null);
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkUninstallStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            checkUninstallStatus();
        });
    });

    it('uninstalled - container destroyed', function (done) {
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            if (data) {
                console.log('Container is still alive', data);
            }
            expect(error).to.be.ok();
            done();
        });
    });

    it('uninstalled - volume destroyed', function (done) {
        expect(!fs.existsSync(config.appDataRoot + '/' + APP_ID));
        done();
    });

    it('uninstalled - unregistered subdomain', function (done) {
        hockServer.done(function (error) { // checks if all the hockServer APIs were called
            expect(!error).to.be.ok();
            done();
        });
    });

    it('uninstalled - removed nginx', function (done) {
        expect(!fs.existsSync(config.nginxAppConfigDir + '/' + APP_LOCATION + '.conf'));
        done();
    });
});

describe('App installation - port bindings', function () {
    this.timeout(50000);

    var hockServer;

    before(function (done) {
        setup(function (error) {
            if (error) return done(error);

            hock(parseInt(url.parse(config.appServerUrl).port, 10), function (error, server) {
                if (error) return done(error);
                var manifest = JSON.parse(fs.readFileSync(__dirname + '/test.app', 'utf8'));
                hockServer = server;

                hockServer
                    .get('/api/v1/app/' + APP_ID + '/manifest')
                    .reply(200, manifest, { 'Content-Type': 'application/json' })
                    .post('/api/v1/subdomains?token=' + config.token, { subdomain: APP_LOCATION })
                    .reply(201, { }, { 'Content-Type': 'application/json' })
                    .delete('/api/v1/subdomains/' + APP_LOCATION + '?token=' + config.token)
                    .reply(200, { }, { 'Content-Type': 'application/json' });
                done();
            });
        });
    });

    after(function (done) {
        cleanup(function (error) {
            if (error) return done(error);
            hockServer.close(done);
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
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkInstallStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/app/install')
              .query({ access_token: token })
              .send({ app_id: APP_ID, password: PASSWORD, location: APP_LOCATION, portBindings: { '7778' : '7171' } })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            checkInstallStatus();
        });
    });

    it('installation - container created', function (done) {
        expect(appInfo.containerId).to.be.ok();
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Config.ExposedPorts['7777/tcp']).to.eql({ });
            expect(data.Config.Env).to.contain('ECHO_SERVER_PORT=7171');
            expect(data.HostConfig.PortBindings['7778/tcp'][0].HostPort).to.eql('7171');
            done();
        });
    });

    it('installation - nginx config', function (done) {
        expect(fs.existsSync(config.nginxAppConfigDir + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('installation - registered subdomain', function (done) {
        // this is checked in unregister subdomain testcase
        done();
    });

    it('installation - volume created', function (done) {
        expect(fs.existsSync(config.appDataRoot + '/' + APP_ID));
        done();
    });

    it('installation - http is up and running', function (done) {
        var tryCount = 20;
        (function healthCheck() {
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.health_check_url)
                .end(function (err, res) {
                if (err || res.statusCode !== 200) {
                    if (--tryCount === 0) return done(new Error('Timedout'));
                    return setTimeout(healthCheck, 2000);
                }

                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                done();
            });
        })();
    });

    it('installation - tcp port mapping works', function (done) {
        var client = net.connect(7171);
        client.on('data', function (data) {
            expect(data.toString()).to.eql('ECHO_SERVER_PORT=7171');
            done();
        });
        client.on('error', done);
    });

    it('installation - running container has volume mounted', function (done) {
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Volumes['/app/data']).to.eql(config.appDataRoot + '/' + APP_ID);
            done();
        });
    });

    it('can uninstall app', function (done) {
        var count = 0;
        function checkUninstallStatus() {
            request.get(SERVER_URL + '/api/v1/app/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                if (res.statusCode === 404) return done(null);
                if (++count > 20) return done(new Error('Timedout'));
                setTimeout(checkUninstallStatus, 400);
            });
        }

        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            checkUninstallStatus();
        });
    });

    it('uninstalled - container destroyed', function (done) {
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            expect(error).to.be.ok();
            expect(data).to.not.be.ok();
            done();
        });
    });

    it('uninstalled - volume destroyed', function (done) {
        expect(!fs.existsSync(config.appDataRoot + '/' + APP_ID));
        done();
    });

    it('uninstalled - unregistered subdomain', function (done) {
        hockServer.done(function (error) { // checks if all the hockServer APIs were called
            expect(!error).to.be.ok();
            done();
        });
    });

    it('uninstalled - removed nginx', function (done) {
        expect(!fs.existsSync(config.nginxAppConfigDir + '/' + APP_LOCATION + '.conf'));
        done();
    });
});

