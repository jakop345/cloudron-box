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
    clientdb = require('../../clientdb.js'),
    async = require('async'),
    hock = require('hock'),
    appdb = require('../../appdb.js'),
    url = require('url'),
    Docker = require('dockerode'),
    assert = require('assert'),
    net = require('net'),
    config = require('../../../config.js'),
    _ = require('underscore'),
    appFqdn = require('../../apps').appFqdn;

var SERVER_URL = 'http://localhost:' + config.port;

var APP_ID = 'test';
var APP_LOCATION = 'location';

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var server;
var docker = os.platform() === 'linux' ? new Docker({socketPath: '/var/run/docker.sock'}) : new Docker({ host: 'http://localhost', port: 2375 });
var token = null; // authentication token

function startDockerProxy(interceptor, callback) {
    assert(typeof interceptor === 'function');

    var http = require('http');
    var dockerOptions;
    if (os.platform() === 'linux') {
        dockerOptions = { socketPath: '/var/run/docker.sock'};
    } else {
        dockerOptions = { host: 'localhost', port: 2375 };
    }

    return http.createServer(function (req, res) {
        if (interceptor(req, res)) return;

        var options = _.extend({ }, dockerOptions, { method: req.method, path: req.url, headers: req.headers });
        var dockerRequest = http.request(options, function (dockerResponse) {
            res.writeHead(dockerResponse.statusCode, dockerResponse.headers);
            dockerResponse.pipe(res, { end: true });
        });

        req.pipe(dockerRequest, { end: true });

    }).listen(5687, callback);
}

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
    var dockerProxy;

    before(function (done) {
        dockerProxy = startDockerProxy(function interceptor() { return false; }, function () {
            setup(done);
        });
    });
    after(function (done) {
        cleanup(function () {
            dockerProxy.close(done);
        });
    });

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

    var hockServer, dockerProxy;
    var imageDeleted = false, imageCreated = false;

    before(function (done) {
        async.series([
            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=girish%2Ftest&tag=0.3') {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/girish/test:0.3?force=true&noprune=false') {
                        imageDeleted = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    }
                    return false;
                }, callback);
            },

            setup,

            function (callback) {
                hock(parseInt(url.parse(config.appServerUrl).port, 10), function (error, server) {
                    if (error) return done(error);
                    var manifest = JSON.parse(fs.readFileSync(__dirname + '/test.app', 'utf8'));
                    hockServer = server;

                    hockServer
                        .get('/api/v1/appstore/apps/' + APP_ID + '/manifest')
                        .reply(200, manifest, { 'Content-Type': 'application/json' })
                        .post('/api/v1/subdomains?token=' + config.token, { subdomain: APP_LOCATION, appId: APP_ID })
                        .reply(201, { }, { 'Content-Type': 'application/json' })
                        .delete('/api/v1/subdomains/' + APP_ID + '?token=' + config.token)
                        .reply(200, { }, { 'Content-Type': 'application/json' });
                    callback();
                });
            }
        ], done);
    });

    after(function (done) {
        cleanup(function (error) {
            if (error) return done(error);
            hockServer.close(function () {
                dockerProxy.close(done);
            });
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

    it('installation - image created', function (done) {
        expect(imageCreated).to.be.ok();
        done();
    });

    it('installation - container created', function (done) {
        expect(appInfo.containerId).to.be.ok();
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Config.ExposedPorts['7777/tcp']).to.eql({ });
            expect(data.Config.Env).to.contain('APP_ORIGIN=https://' + appFqdn(appInfo.location));
            expect(data.Config.Env).to.contain('ADMIN_ORIGIN=' + config.adminOrigin);
            clientdb.get(appInfo.id, function (error, client) {
                expect(error).to.not.be.ok();
                expect(client.clientId.length).to.be(40); // cid- + 32 hex chars (128 bits) + 4 hyphens
                expect(client.clientSecret.length).to.be(36); // 32 hex chars (128 bits) + 4 hyphens
                expect(data.Config.Env).to.contain('OAUTH_CLIENT_ID=' + client.clientId);
                expect(data.Config.Env).to.contain('OAUTH_CLIENT_SECRET=' + client.clientSecret);
                done();
            });
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
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.healthCheckPath)
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

    it('can stop app', function (done) {
        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/stop')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done();
        });
    });

    it('did stop the app', function (done) {
        // give the app a couple of seconds to die
        setTimeout(function () {
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.healthCheckPath)
                .end(function (err, res) {
                expect(err).to.be.ok();
                done();
            });
        }, 2000);
    });

    it('can start app', function (done) {
        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/start')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done();
        });
    });

    it('did start the app', function (done) {
        setTimeout(function () {
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.healthCheckPath)
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

    it('uninstalled - image destroyed', function (done) {
        expect(imageDeleted).to.be.ok();
        done();
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

    var hockServer, dockerProxy;
    var imageDeleted = false, imageCreated = false;

    before(function (done) {
        async.series([
            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=girish%2Ftest&tag=0.3') {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/girish/test:0.3?force=true&noprune=false') {
                        imageDeleted = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    }
                    return false;
                }, callback);
            },

            setup,

            function (callback) {
                hock(parseInt(url.parse(config.appServerUrl).port, 10), function (error, server) {
                    if (error) return done(error);
                    var manifest = JSON.parse(fs.readFileSync(__dirname + '/test.app', 'utf8'));
                    hockServer = server;

                hockServer
                    .get('/api/v1/appstore/apps/' + APP_ID + '/manifest')
                    .reply(200, manifest, { 'Content-Type': 'application/json' })
                    // app install
                    .post('/api/v1/subdomains?token=' + config.token, { subdomain: APP_LOCATION, appId: APP_ID })
                    .reply(201, { }, { 'Content-Type': 'application/json' })
                    // app configure
                    .delete('/api/v1/subdomains/' + APP_ID + '?token=' + config.token)
                    .reply(200, { }, { 'Content-Type': 'application/json' })
                    .post('/api/v1/subdomains?token=' + config.token, { subdomain: APP_LOCATION, appId: APP_ID })
                    .reply(201, { }, { 'Content-Type': 'application/json' })
                    // app remove
                    .delete('/api/v1/subdomains/' + APP_ID + '?token=' + config.token)
                    .reply(200, { }, { 'Content-Type': 'application/json' });

                    callback();
                });
            }
        ], done);
    });

    after(function (done) {
        cleanup(function (error) {
            if (error) return done(error);
            hockServer.close(function () {
                dockerProxy.close(done);
            });
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

    it('installation - image created', function (done) {
        expect(imageCreated).to.be.ok();
        done();
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
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.healthCheckPath)
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

    it('can reconfigure app', function (done) {
        var count = 0;
        function checkConfigureStatus() {
            request.get(SERVER_URL + '/api/v1/app/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appInfo = res.body; return done(null); }
                if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkConfigureStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/configure')
              .query({ access_token: token })
              .send({ app_id: APP_ID, password: PASSWORD, portBindings: { '7778' : '7172' } })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            checkConfigureStatus();
        });
    });

    it('port mapping works after reconfiguration', function (done) {
        setTimeout(function () {
            var client = net.connect(7172);
            client.on('data', function (data) {
                expect(data.toString()).to.eql('ECHO_SERVER_PORT=7172');
                done();
            });
            client.on('error', done);
        }, 2000);
    });

    it('can stop app', function (done) {
        request.post(SERVER_URL + '/api/v1/app/' + APP_ID + '/stop')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done();
        });
    });

    xit('did stop the app', function (done) {
        setTimeout(function () {
            var client = net.connect(7171);
            client.setTimeout(2000);
            client.on('connect', function () { done(new Error('Got connected')); });
            client.on('timeout', function () { done(); });
            client.on('error', function (error) { console.log('got error'); done(); });
            client.on('data', function (data) {
                done(new Error('Expected connection to fail!'));
            });
        }, 3000); // give the app some time to die
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

    it('uninstalled - image destroyed', function (done) {
        expect(imageDeleted).to.be.ok();
        done();
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

