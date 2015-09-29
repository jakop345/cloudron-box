'use strict';

/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var appdb = require('../../appdb.js'),
    apps = require('../../apps.js'),
    assert = require('assert'),
    path = require('path'),
    async = require('async'),
    child_process = require('child_process'),
    clientdb = require('../../clientdb.js'),
    config = require('../../config.js'),
    constants = require('../../constants.js'),
    database = require('../../database.js'),
    docker = require('../../docker.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    hock = require('hock'),
    http = require('http'),
    https = require('https'),
    js2xml = require('js2xmlparser'),
    net = require('net'),
    nock = require('nock'),
    os = require('os'),
    paths = require('../../paths.js'),
    redis = require('redis'),
    request = require('superagent'),
    safe = require('safetydance'),
    server = require('../../server.js'),
    settings = require('../../settings.js'),
    tokendb = require('../../tokendb.js'),
    url = require('url'),
    util = require('util'),
    uuid = require('node-uuid'),
    _ = require('underscore');

var SERVER_URL = 'http://localhost:' + config.get('port');

// Test image information
var TEST_IMAGE_REPO = 'cloudron/test';
var TEST_IMAGE_TAG = '2.0.1';
var TEST_IMAGE_ID = 'f0c6f6fe356b1bb35408d2fafc5cca679ee66125d018082f6695a90a3e5f9ce0';

var APP_STORE_ID = 'test', APP_ID;
var APP_LOCATION = 'appslocation';
var APP_LOCATION_2 = 'appslocationtwo';
var APP_LOCATION_NEW = 'appslocationnew';
var APP_MANIFEST = JSON.parse(fs.readFileSync(__dirname + '/../../../../test-app/CloudronManifest.json', 'utf8'));
APP_MANIFEST.dockerImage = TEST_IMAGE_REPO + ':' + TEST_IMAGE_TAG;
var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='admin@me.com';
var USERNAME_1 = 'user', PASSWORD_1 = 'password', EMAIL_1 ='user@me.com';
var token = null; // authentication token
var token_1 = null;

 var awsHostedZones = {
     HostedZones: [{
         Id: '/hostedzone/ZONEID',
         Name: 'localhost.',
         CallerReference: '305AFD59-9D73-4502-B020-F4E6F889CB30',
         ResourceRecordSetCount: 2,
         ChangeInfo: {
             Id: '/change/CKRTFJA0ANHXB',
             Status: 'INSYNC'
         }
     }],
    IsTruncated: false,
    MaxItems: '100'
 };

function startDockerProxy(interceptor, callback) {
    assert.strictEqual(typeof interceptor, 'function');

    return http.createServer(function (req, res) {
        if (interceptor(req, res)) return;

        // rejectUnauthorized should not be required but it doesn't work without it
        var options = _.extend({ }, docker.options, { method: req.method, path: req.url, headers: req.headers, rejectUnauthorized: false });
        delete options.protocol; // https module doesn't like this key
        var proto = docker.options.protocol === 'https' ? https : http;
        var dockerRequest = proto.request(options, function (dockerResponse) {
            res.writeHead(dockerResponse.statusCode, dockerResponse.headers);
            dockerResponse.on('error', console.error);
            dockerResponse.pipe(res, { end: true });
        });

        req.on('error', console.error);
        if (!req.readable) {
            dockerRequest.end();
        } else {
            req.pipe(dockerRequest, { end: true });
        }

    }).listen(5687, callback);
}

function setup(done) {
    async.series([
        // first clear, then start server. otherwise, taskmanager spins up tasks for obsolete appIds
        database.initialize,
        database._clear,

        server.start.bind(server),

        function (callback) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
            var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                expect(result.statusCode).to.eql(201);
                expect(scope1.isDone()).to.be.ok();
                expect(scope2.isDone()).to.be.ok();

                // stash for further use
                token = result.body.token;

                callback();
            });
        },

        function (callback) {
            console.log('Starting addons, this can take 10 seconds');
            child_process.exec(__dirname + '/start_addons.sh', callback);
        },

        function (callback) {
            request.post(SERVER_URL + '/api/v1/users')
                   .query({ access_token: token })
                   .send({ username: USERNAME_1, email: EMAIL_1 })
                   .end(function (err, res) {
                expect(err).to.not.be.ok();
                expect(res.statusCode).to.equal(201);

                callback(null);
            });
        }, function (callback) {
            token_1 = tokendb.generateToken();

            // HACK to get a token for second user (passwords are generated and the user should have gotten a password setup link...)
            tokendb.add(token_1, tokendb.PREFIX_USER + USERNAME_1, 'test-client-id',  Date.now() + 100000, '*', callback);
        }
    ], done);
}

function cleanup(done) {
    // db is not cleaned up here since it's too late to call it after server.stop. if called before server.stop taskmanager apptasks are unhappy :/
    async.series([
        server.stop,

        function (callback) { setTimeout(callback, 2000); }, // give taskmanager tasks couple of seconds to finish

        child_process.exec.bind(null, 'docker rm -f mysql; docker rm -f postgresql; docker rm -f mongodb')
    ], done);
}

describe('App API', function () {
    this.timeout(50000);
    var dockerProxy;

    before(function (done) {
        dockerProxy = startDockerProxy(function interceptor(req, res) {
            if (req.method === 'DELETE' && req.url === '/images/' + TEST_IMAGE_ID + '?force=true&noprune=false') {
                res.writeHead(200);
                res.end();
                return true;
            }

            return false;
        }, function () {
            setup(done);
        });
    });

    after(function (done) {
        APP_ID = null;
        cleanup(function () {
            dockerProxy.close(done);
        });
    });

    it('app install fails - missing manifest', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('manifest is required');
            done(err);
        });
    });

    it('app install fails - missing appId', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ manifest: APP_MANIFEST, password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('appStoreId is required');
            done(err);
        });
    });

    it('app install fails - invalid json', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send('garbage')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('app install fails - invalid location', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: '!awesome', accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('Hostname can only contain alphanumerics and hyphen');
            done(err);
        });
    });

    it('app install fails - invalid location type', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: 42, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('location is required');
            done(err);
        });
    });

    it('app install fails - reserved admin location', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: constants.ADMIN_LOCATION, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql(constants.ADMIN_LOCATION + ' is reserved');
            done(err);
        });
    });

    it('app install fails - reserved api location', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: constants.API_LOCATION, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql(constants.API_LOCATION + ' is reserved');
            done(err);
        });
    });

    it('app install fails - portBindings must be object', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: 23, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('portBindings must be an object');
            done(err);
        });
    });

    it('app install fails - accessRestriction is required', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: {} })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('accessRestriction is required');
            done(err);
        });
    });

    it('app install fails for non admin', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token_1 })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('app install fails due to purchase failure', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(402, {});

        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(402);
            expect(fake.isDone()).to.be.ok();
            done(err);
        });
    });

    it('app install succeeds with purchase', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(201, {});

        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            expect(res.body.id).to.be.a('string');
            APP_ID = res.body.id;
            expect(fake.isDone()).to.be.ok();
            done(err);
        });
    });

    it('app install fails because of conflicting location', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(201, {});

        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(409);
            expect(fake.isDone()).to.be.ok();
            done();
        });
    });

    it('can get app status', function (done) {
        request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.id).to.eql(APP_ID);
            expect(res.body.installationState).to.be.ok();
            done(err);
         });
    });

    it('cannot get invalid app status', function (done) {
        request.get(SERVER_URL + '/api/v1/apps/kubachi')
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

    it('non admin can get all apps', function (done) {
        request.get(SERVER_URL + '/api/v1/apps')
               .query({ access_token: token_1 })
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
        request.post(SERVER_URL + '/api/v1/apps/whatever/uninstall')
            .send({ password: PASSWORD })
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
        });
    });

    it('cannot uninstall app without password', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('cannot uninstall app with wrong password', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .send({ password: PASSWORD+PASSWORD })
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('non admin cannot uninstall app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .send({ password: PASSWORD })
            .query({ access_token: token_1 })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('can uninstall app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .send({ password: PASSWORD })
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            done(err);
        });
    });

    it('app install succeeds already purchased', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(200, {});

        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION_2, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            expect(res.body.id).to.be.a('string');
            APP_ID = res.body.id;
            expect(fake.isDone()).to.be.ok();
            done(err);
        });
    });

    it('app install succeeds without password but developer token', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(201, {});

        settings.setDeveloperMode(true, function (error) {
            expect(error).to.be(null);

            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: PASSWORD })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.expiresAt).to.be.a('number');
                expect(result.body.token).to.be.a('string');

                // overwrite non dev token
                token = result.body.token;

                request.post(SERVER_URL + '/api/v1/apps/install')
                       .query({ access_token: token })
                       .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, location: APP_LOCATION+APP_LOCATION, portBindings: null, accessRestriction: '' })
                       .end(function (err, res) {
                    expect(res.statusCode).to.equal(202);
                    expect(res.body.id).to.be.a('string');
                    expect(fake.isDone()).to.be.ok();
                    APP_ID = res.body.id;
                    done(err);
                });
            });
        });
    });

    it('can uninstall app without password but developer token', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            done(err);
        });
    });
});

describe('App installation', function () {
    this.timeout(50000);

    var apiHockInstance = hock.createHock({ throwOnUnmatched: false }), apiHockServer, dockerProxy;
    var awsHockInstance = hock.createHock({ throwOnUnmatched: false }), awsHockServer;
    var imageDeleted = false, imageCreated = false;

    before(function (done) {
        APP_ID = uuid.v4();

        async.series([
            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=' + encodeURIComponent(TEST_IMAGE_REPO) + '&tag=' + TEST_IMAGE_TAG) {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/' + TEST_IMAGE_ID + '?force=true&noprune=false') {
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
                apiHockInstance
                    .get('/api/v1/apps/' + APP_STORE_ID + '/versions/' + APP_MANIFEST.version + '/icon')
                    .replyWithFile(200, path.resolve(__dirname, '../../../webadmin/src/img/appicon_fallback.png'))
                    .post('/api/v1/boxes/' + config.fqdn() + '/awscredentials?token=APPSTORE_TOKEN')
                    .max(Infinity)
                    .reply(201, { credentials: { AccessKeyId: 'accessKeyId', SecretAccessKey: 'secretAccessKey', SessionToken: 'sessionToken' } }, { 'Content-Type': 'application/json' });

                var port = parseInt(url.parse(config.apiServerOrigin()).port, 10);
                apiHockServer = http.createServer(apiHockInstance.handler).listen(port, callback);
            },

            function (callback) {
                awsHockInstance
                    .get('/2013-04-01/hostedzone')
                    .max(Infinity)
                    .reply(200, js2xml('ListHostedZonesResponse', awsHostedZones, { arrayMap: { HostedZones: 'HostedZone'} }), { 'Content-Type': 'application/xml' })
                    .filteringRequestBody(function (unusedBody) { return ''; }) // strip out body
                    .post('/2013-04-01/hostedzone/ZONEID/rrset/')
                    .max(Infinity)
                    .reply(200, js2xml('ChangeResourceRecordSetsResponse', { ChangeInfo: { Id: 'dnsrecordid', Status: 'INSYNC' } }), { 'Content-Type': 'application/xml' });

                var port = parseInt(url.parse(config.aws().endpoint).port, 10);
                awsHockServer = http.createServer(awsHockInstance.handler).listen(port, callback);
            }
        ], done);
    });

    after(function (done) {
        APP_ID = null;

        async.series([
            cleanup,
            apiHockServer.close.bind(apiHockServer),
            awsHockServer.close.bind(awsHockServer),
            dockerProxy.close.bind(dockerProxy)
        ], done);
    });

    var appResult = null /* the json response */, appEntry = null /* entry from database */;

    it('can install test app', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(201, {});

        var count = 0;
        function checkInstallStatus() {
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appResult = res.body; return done(null); }
                if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkInstallStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/apps/install')
              .query({ access_token: token })
              .send({ appId: APP_ID, appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            expect(fake.isDone()).to.be.ok();
            expect(res.body.id).to.be.a('string');
            expect(res.body.id).to.be.eql(APP_ID);
            checkInstallStatus();
        });
    });

    it('installation - image created', function (done) {
        expect(imageCreated).to.be.ok();
        done();
    });

    it('installation - can get app', function (done) {
        apps.get(appResult.id, function (error, app) {
            expect(!error).to.be.ok();
            expect(app).to.be.an('object');
            appEntry = app;
            done();
        });
    });

    it('installation - container created', function (done) {
        expect(appResult.containerId).to.be(undefined);
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Config.ExposedPorts['7777/tcp']).to.eql({ });
            expect(data.Config.Env).to.contain('WEBADMIN_ORIGIN=' + config.adminOrigin());
            expect(data.Config.Env).to.contain('API_ORIGIN=' + config.adminOrigin());
            expect(data.Config.Env).to.contain('CLOUDRON=1');
            clientdb.getByAppId('addon-' + appResult.id, function (error, client) {
                expect(error).to.not.be.ok();
                expect(client.id.length).to.be(46); // cid-addon- + 32 hex chars (128 bits) + 4 hyphens
                expect(client.clientSecret.length).to.be(64); // 32 hex chars (256 bits)
                expect(data.Config.Env).to.contain('OAUTH_CLIENT_ID=' + client.id);
                expect(data.Config.Env).to.contain('OAUTH_CLIENT_SECRET=' + client.clientSecret);
                done();
            });
        });
    });

    it('installation - nginx config', function (done) {
        expect(fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('installation - registered subdomain', function (done) {
        // this is checked in unregister subdomain testcase
        done();
    });

    it('installation - volume created', function (done) {
        expect(fs.existsSync(paths.DATA_DIR + '/' + APP_ID));
        done();
    });

    it('installation - is up and running', function (done) {
        expect(appResult.httpPort).to.be(undefined);
        setTimeout(function () {
            request.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
                .end(function (err, res) {
                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                done();
            });
        }, 2000); // give some time for docker to settle
    });

    it('installation - running container has volume mounted', function (done) {
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Volumes['/app/data']).to.eql(paths.DATA_DIR + '/' + APP_ID + '/data');
            done();
        });
    });

    var redisIp, exportedRedisPort;

    it('installation - redis addon created', function (done) {
        docker.getContainer('redis-' + APP_ID).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data).to.be.ok();

            redisIp = safe.query(data, 'NetworkSettings.IPAddress');
            expect(redisIp).to.be.ok();

            exportedRedisPort = safe.query(data, 'NetworkSettings.Ports.6379/tcp[0].HostPort');
            expect(exportedRedisPort).to.be.ok();

            done();
        });
    });

    it('installation - redis addon config', function (done) {
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            var redisUrl = null;
            data.Config.Env.forEach(function (env) { if (env.indexOf('REDIS_URL=') === 0) redisUrl = env.split('=')[1]; });
            expect(redisUrl).to.be.ok();

            var urlp = url.parse(redisUrl);
            var password = urlp.auth.split(':')[1];

            expect(data.Config.Env).to.contain('REDIS_PORT=6379');
            expect(data.Config.Env).to.contain('REDIS_HOST=redis-' + APP_ID);
            expect(data.Config.Env).to.contain('REDIS_PASSWORD=' + password);

            expect(urlp.hostname).to.be('redis-' + APP_ID);

            var isMac = os.platform() === 'darwin';
            var client =
                isMac ? redis.createClient(parseInt(exportedRedisPort, 10), '127.0.0.1', { auth_pass: password })
                      : redis.createClient(parseInt(urlp.port, 10), redisIp, { auth_pass: password });
            client.on('error', done);
            client.set('key', 'value');
            client.get('key', function (err, reply) {
                expect(err).to.not.be.ok();
                expect(reply.toString()).to.be('value');
                client.end();
                done();
            });
        });
    });

    it('installation - mysql addon config', function (done) {
        var appContainer = docker.getContainer(appEntry.containerId);
        appContainer.inspect(function (error, data) {
            var mysqlUrl = null;
            data.Config.Env.forEach(function (env) { if (env.indexOf('MYSQL_URL=') === 0) mysqlUrl = env.split('=')[1]; });
            expect(mysqlUrl).to.be.ok();

            var urlp = url.parse(mysqlUrl);
            var username = urlp.auth.split(':')[0];
            var password = urlp.auth.split(':')[1];
            var dbname = urlp.path.substr(1);

            expect(data.Config.Env).to.contain('MYSQL_PORT=3306');
            expect(data.Config.Env).to.contain('MYSQL_HOST=mysql');
            expect(data.Config.Env).to.contain('MYSQL_USERNAME=' + username);
            expect(data.Config.Env).to.contain('MYSQL_PASSWORD=' + password);
            expect(data.Config.Env).to.contain('MYSQL_DATABASE=' + dbname);

            var cmd = util.format('mysql -h %s -u%s -p%s --database=%s -e "CREATE TABLE IF NOT EXISTS foo (id INT);"',
                'mysql', username, password, dbname);

            child_process.exec('docker exec ' + appContainer.id + ' ' + cmd, { timeout: 5000 }, function (error, stdout, stderr) {
                expect(!error).to.be.ok();
                expect(stdout.length).to.be(0);
                // expect(stderr.length).to.be(0); // "Warning: Using a password on the command line interface can be insecure."
                done();
            });
        });
    });

    it('installation - postgresql addon config', function (done) {
        var appContainer = docker.getContainer(appEntry.containerId);
        appContainer.inspect(function (error, data) {
            var postgresqlUrl = null;
            data.Config.Env.forEach(function (env) { if (env.indexOf('POSTGRESQL_URL=') === 0) postgresqlUrl = env.split('=')[1]; });
            expect(postgresqlUrl).to.be.ok();

            var urlp = url.parse(postgresqlUrl);
            var username = urlp.auth.split(':')[0];
            var password = urlp.auth.split(':')[1];
            var dbname = urlp.path.substr(1);

            expect(data.Config.Env).to.contain('POSTGRESQL_PORT=5432');
            expect(data.Config.Env).to.contain('POSTGRESQL_HOST=postgresql');
            expect(data.Config.Env).to.contain('POSTGRESQL_USERNAME=' + username);
            expect(data.Config.Env).to.contain('POSTGRESQL_PASSWORD=' + password);
            expect(data.Config.Env).to.contain('POSTGRESQL_DATABASE=' + dbname);

            var cmd = util.format('bash -c "PGPASSWORD=%s psql -q -h %s -U%s --dbname=%s -e \'CREATE TABLE IF NOT EXISTS foo (id INT);\'"',
                password, 'postgresql', username, dbname);

            child_process.exec('docker exec ' + appContainer.id + ' ' + cmd, { timeout: 5000 }, function (error, stdout, stderr) {
                expect(!error).to.be.ok();
                expect(stdout.length).to.be(0);
                expect(stderr.length).to.be(0);
                done();
            });
        });
    });

    it('logs - stdout and stderr', function (done) {
        request.get(SERVER_URL + '/api/v1/apps/' + APP_ID + '/logs')
            .query({ access_token: token })
            .end(function (err, res) {
            var data = '';
            res.on('data', function (d) { data += d.toString('utf8'); });
            res.on('end', function () {
                expect(data.length).to.not.be(0);
                done();
            });
            res.on('error', done);
        });
    });

    it('logStream - requires event-stream accept header', function (done) {
        request.get(SERVER_URL + '/api/v1/apps/' + APP_ID + '/logstream')
            .query({ access_token: token, fromLine: 0 })
            .end(function (err, res) {
            expect(res.statusCode).to.be(400);
            done();
        });
    });


    it('logStream - stream logs', function (done) {
        var options = {
            port: config.get('port'), host: 'localhost', path: '/api/v1/apps/' + APP_ID + '/logstream?access_token=' + token,
            headers: { 'Accept': 'text/event-stream', 'Connection': 'keep-alive' }
        };

        // superagent doesn't work. maybe https://github.com/visionmedia/superagent/issues/420
        var req = http.get(options, function (res) {
            var data = '';
            res.on('data', function (d) { data += d.toString('utf8'); });
            setTimeout(function checkData() {
                expect(data.length).to.not.be(0);
                var lineNumber = 1;
                data.split('\n').forEach(function (line) {
                    if (line.indexOf('id: ') !== 0) return;
                    expect(parseInt(line.substr(4), 10)).to.be(lineNumber); // line number
                    ++lineNumber;
                });

                req.abort();
                expect(lineNumber).to.be.above(1);
                done();
            }, 1000);
            res.on('error', done);
        });

        req.on('error', done);
    });

    it('non admin cannot stop app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/stop')
            .query({ access_token: token_1 })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('can stop app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/stop')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            done();
        });
    });

    it('did stop the app', function (done) {
        // give the app a couple of seconds to die
        setTimeout(function () {
            request.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
                .end(function (err, res) {
                expect(err).to.be.ok();
                done();
            });
        }, 2000);
    });

    it('nonadmin cannot start app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/start')
            .query({ access_token: token_1 })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('can start app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/start')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            done();
        });
    });

    it('did start the app', function (done) {
        setTimeout(function () {
            request.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
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
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                if (res.statusCode === 404) return done(null);
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkUninstallStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .send({ password: PASSWORD })
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            checkUninstallStatus();
        });
    });

    it('uninstalled - container destroyed', function (done) {
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
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
        expect(!fs.existsSync(paths.DATA_DIR + '/' + APP_ID));
        done();
    });

    it('uninstalled - unregistered subdomain', function (done) {
        apiHockInstance.done(function (error) { // checks if all the apiHockServer APIs were called
            expect(!error).to.be.ok();

            awsHockInstance.done(function (error) {
                expect(!error).to.be.ok();
                done();
            });
        });
    });

    it('uninstalled - removed nginx', function (done) {
        expect(!fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('uninstalled - removed redis addon', function (done) {
        docker.getContainer('redis-' + APP_ID).inspect(function (error, data) {
            expect(error).to.be.ok();
            done();
        });
    });
});

describe('App installation - port bindings', function () {
    this.timeout(50000);

    var apiHockInstance = hock.createHock({ throwOnUnmatched: false }), apiHockServer, dockerProxy;
    var awsHockInstance = hock.createHock({ throwOnUnmatched: false }), awsHockServer;
    var imageDeleted = false, imageCreated = false;

    before(function (done) {
        APP_ID = uuid.v4();
        async.series([
            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=' + encodeURIComponent(TEST_IMAGE_REPO) + '&tag=' + TEST_IMAGE_TAG) {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/' + TEST_IMAGE_ID + '?force=true&noprune=false') {
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
                apiHockInstance
                    .get('/api/v1/apps/' + APP_STORE_ID + '/versions/' + APP_MANIFEST.version + '/icon')
                    .replyWithFile(200, path.resolve(__dirname, '../../../webadmin/src/img/appicon_fallback.png'))
                    .post('/api/v1/boxes/' + config.fqdn() + '/awscredentials?token=APPSTORE_TOKEN')
                    .max(Infinity)
                    .reply(201, { credentials: { AccessKeyId: 'accessKeyId', SecretAccessKey: 'secretAccessKey', SessionToken: 'sessionToken' } }, { 'Content-Type': 'application/json' });

                var port = parseInt(url.parse(config.apiServerOrigin()).port, 10);
                apiHockServer = http.createServer(apiHockInstance.handler).listen(port, callback);
            },

            function (callback) {
                awsHockInstance
                    .get('/2013-04-01/hostedzone')
                    .max(Infinity)
                    .reply(200, js2xml('ListHostedZonesResponse', awsHostedZones, { arrayMap: { HostedZones: 'HostedZone'} }), { 'Content-Type': 'application/xml' })
                    .filteringRequestBody(function (unusedBody) { return ''; }) // strip out body
                    .post('/2013-04-01/hostedzone/ZONEID/rrset/')
                    .max(Infinity)
                    .reply(200, js2xml('ChangeResourceRecordSetsResponse', { ChangeInfo: { Id: 'dnsrecordid', Status: 'INSYNC' } }), { 'Content-Type': 'application/xml' });

                var port = parseInt(url.parse(config.aws().endpoint).port, 10);
                awsHockServer = http.createServer(awsHockInstance.handler).listen(port, callback);
            }
        ], done);
    });

    after(function (done) {
        APP_ID = null;
        async.series([
            cleanup,
            apiHockServer.close.bind(apiHockServer),
            awsHockServer.close.bind(awsHockServer),
            dockerProxy.close.bind(dockerProxy)
        ], done);
    });

    var appResult = null, appEntry = null;

    it('can install test app', function (done) {
        var fake = nock(config.apiServerOrigin()).post('/api/v1/apps/test/purchase?token=APPSTORE_TOKEN').reply(201, {});

        var count = 0;
        function checkInstallStatus() {
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appResult = res.body; return done(null); }
                if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkInstallStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/apps/install')
              .query({ access_token: token })
              .send({ appId: APP_ID, appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: { ECHO_SERVER_PORT: 7171 }, accessRestriction: '' })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            expect(fake.isDone()).to.be.ok();
            expect(res.body.id).to.equal(APP_ID);
            checkInstallStatus();
        });
    });

    it('installation - image created', function (done) {
        expect(imageCreated).to.be.ok();
        done();
    });

    it('installation - can get app', function (done) {
        apps.get(appResult.id, function (error, app) {
            expect(!error).to.be.ok();
            expect(app).to.be.an('object');
            appEntry = app;
            done();
        });
    });

    it('installation - container created', function (done) {
        expect(appResult.containerId).to.be(undefined);
        expect(appEntry.containerId).to.be.ok();
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Config.ExposedPorts['7777/tcp']).to.eql({ });
            expect(data.Config.Env).to.contain('ECHO_SERVER_PORT=7171');
            expect(data.HostConfig.PortBindings['7778/tcp'][0].HostPort).to.eql('7171');
            done();
        });
    });

    it('installation - nginx config', function (done) {
        expect(fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('installation - registered subdomain', function (done) {
        // this is checked in unregister subdomain testcase
        done();
    });

    it('installation - volume created', function (done) {
        expect(fs.existsSync(paths.DATA_DIR + '/' + APP_ID));
        done();
    });

    it('installation - http is up and running', function (done) {
        var tryCount = 20;
        expect(appResult.httpPort).to.be(undefined);
        (function healthCheck() {
            request.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
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
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data.Volumes['/app/data']).to.eql(paths.DATA_DIR + '/' + APP_ID + '/data');
            done();
        });
    });

    var redisIp, exportedRedisPort;

    it('installation - redis addon created', function (done) {
        docker.getContainer('redis-' + APP_ID).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data).to.be.ok();

            redisIp = safe.query(data, 'NetworkSettings.IPAddress');
            expect(redisIp).to.be.ok();

            exportedRedisPort = safe.query(data, 'NetworkSettings.Ports.6379/tcp[0].HostPort');
            expect(exportedRedisPort).to.be.ok();

            done();
        });
    });

    it('installation - redis addon config', function (done) {
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            var redisUrl = null;
            data.Config.Env.forEach(function (env) { if (env.indexOf('REDIS_URL=') === 0) redisUrl = env.split('=')[1]; });
            expect(redisUrl).to.be.ok();

            var urlp = url.parse(redisUrl);
            expect(urlp.hostname).to.be('redis-' + APP_ID);

            var password = urlp.auth.split(':')[1];

            expect(data.Config.Env).to.contain('REDIS_PORT=6379');
            expect(data.Config.Env).to.contain('REDIS_HOST=redis-' + APP_ID);
            expect(data.Config.Env).to.contain('REDIS_PASSWORD=' + password);

            function checkRedis() {
                var isMac = os.platform() === 'darwin';
                var client =
                    isMac ? redis.createClient(parseInt(exportedRedisPort, 10), '127.0.0.1', { auth_pass: password })
                          : redis.createClient(parseInt(urlp.port, 10), redisIp, { auth_pass: password });
                client.on('error', done);
                client.set('key', 'value');
                client.get('key', function (err, reply) {
                    expect(err).to.not.be.ok();
                    expect(reply.toString()).to.be('value');
                    client.end();
                    done();
                });
            }

            setTimeout(checkRedis, 1000); // the bridge network takes time to come up?
        });
    });

    function checkConfigureStatus(count, done) {
        assert.strictEqual(typeof count, 'number');
        assert.strictEqual(typeof done, 'function');

        request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
           .query({ access_token: token })
           .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            if (res.body.installationState === appdb.ISTATE_INSTALLED) { appResult = res.body; expect(appResult).to.be.ok(); return done(null); }
            if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
            if (++count > 50) return done(new Error('Timedout'));
            setTimeout(checkConfigureStatus.bind(null, count, done), 1000);
        });
    }

    it('cannot reconfigure app with missing location', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
              .query({ access_token: token })
              .send({ appId: APP_ID, password: PASSWORD, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: 'roleAdmin' })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done();
        });
    });

    it('cannot reconfigure app with missing accessRestriction', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
              .query({ access_token: token })
              .send({ appId: APP_ID, password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 } })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done();
        });
    });

    it('non admin cannot reconfigure app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
              .query({ access_token: token_1 })
              .send({ appId: APP_ID, password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: 'roleAdmin' })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('can reconfigure app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
              .query({ access_token: token })
              .send({ appId: APP_ID, password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: 'roleAdmin' })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            checkConfigureStatus(0, done);
        });
    });

    it('changed container id after reconfigure', function (done) {
        var oldContainerId = appEntry.containerId;
        apps.get(appResult.id, function (error, app) {
            expect(!error).to.be.ok();
            expect(app).to.be.an('object');
            appEntry = app;
            expect(appEntry.containerid).to.not.be(oldContainerId);
            done();
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

    it('reconfiguration - redis addon recreated', function (done) {
        docker.getContainer('redis-' + APP_ID).inspect(function (error, data) {
            expect(error).to.not.be.ok();
            expect(data).to.be.ok();

            redisIp = safe.query(data, 'NetworkSettings.IPAddress');
            expect(redisIp).to.be.ok();

            exportedRedisPort = safe.query(data, 'NetworkSettings.Ports.6379/tcp[0].HostPort');
            expect(exportedRedisPort).to.be.ok();

            done();
        });
    });

    it('redis addon works after reconfiguration', function (done) {
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
            var redisUrl = null;
            data.Config.Env.forEach(function (env) { if (env.indexOf('REDIS_URL=') === 0) redisUrl = env.split('=')[1]; });
            expect(redisUrl).to.be.ok();

            var urlp = url.parse(redisUrl);
            var password = urlp.auth.split(':')[1];

            expect(urlp.hostname).to.be('redis-' + APP_ID);

            expect(data.Config.Env).to.contain('REDIS_PORT=6379');
            expect(data.Config.Env).to.contain('REDIS_HOST=redis-' + APP_ID);
            expect(data.Config.Env).to.contain('REDIS_PASSWORD=' + password);

            var isMac = os.platform() === 'darwin';
            var client =
                isMac ? redis.createClient(parseInt(exportedRedisPort, 10), '127.0.0.1', { auth_pass: password })
                      : redis.createClient(parseInt(urlp.port, 10), redisIp, { auth_pass: password });
            client.on('error', done);
            client.set('key', 'value');
            client.get('key', function (err, reply) {
                expect(err).to.not.be.ok();
                expect(reply.toString()).to.be('value');
                client.end();
                done();
            });
        });
    });

    it('can stop app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/stop')
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            done();
        });
    });

    // osx: if this test is failing, it is probably because of a stray port binding in boot2docker
    it('did stop the app', function (done) {
        setTimeout(function () {
            var client = net.connect(7171);
            client.setTimeout(2000);
            client.on('connect', function () { done(new Error('Got connected')); });
            client.on('timeout', function () { done(); });
            client.on('error', function (error) { done(); });
            client.on('data', function (data) {
                done(new Error('Expected connection to fail!'));
            });
        }, 3000); // give the app some time to die
    });

    it('can uninstall app', function (done) {
        var count = 0;
        function checkUninstallStatus() {
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                if (res.statusCode === 404) return done(null);
                if (++count > 20) return done(new Error('Timedout'));
                setTimeout(checkUninstallStatus, 400);
            });
        }

        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .send({ password: PASSWORD })
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            checkUninstallStatus();
        });
    });

    it('uninstalled - container destroyed', function (done) {
        docker.getContainer(appEntry.containerId).inspect(function (error, data) {
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
        expect(!fs.existsSync(paths.DATA_DIR + '/' + APP_ID));
        done();
    });

    it('uninstalled - unregistered subdomain', function (done) {
        apiHockInstance.done(function (error) { // checks if all the apiHockServer APIs were called
            expect(!error).to.be.ok();

            awsHockInstance.done(function (error) {
                expect(!error).to.be.ok();
                done();
            });
        });
    });

    it('uninstalled - removed nginx', function (done) {
        expect(!fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('uninstalled - removed redis addon', function (done) {
        docker.getContainer('redis-' + APP_ID).inspect(function (error, data) {
            expect(error).to.be.ok();
            done();
        });
    });
});

