'use strict';

/* global it:false */
/* global xit:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var appdb = require('../../appdb.js'),
    apps = require('../../apps.js'),
    assert = require('assert'),
    path = require('path'),
    async = require('async'),
    child_process = require('child_process'),
    clients = require('../../clients.js'),
    config = require('../../config.js'),
    constants = require('../../constants.js'),
    database = require('../../database.js'),
    docker = require('../../docker.js').connection,
    expect = require('expect.js'),
    fs = require('fs'),
    hock = require('hock'),
    http = require('http'),
    https = require('https'),
    js2xml = require('js2xmlparser'),
    ldap = require('../../ldap.js'),
    net = require('net'),
    nock = require('nock'),
    paths = require('../../paths.js'),
    safe = require('safetydance'),
    server = require('../../server.js'),
    settings = require('../../settings.js'),
    simpleauth = require('../../simpleauth.js'),
    superagent = require('superagent'),
    taskmanager = require('../../taskmanager.js'),
    tokendb = require('../../tokendb.js'),
    url = require('url'),
    uuid = require('node-uuid'),
    _ = require('underscore');

var SERVER_URL = 'http://localhost:' + config.get('port');

// Test image information
var TEST_IMAGE_REPO = 'cloudron/test';
var TEST_IMAGE_TAG = '17.0.0';
var TEST_IMAGE = TEST_IMAGE_REPO + ':' + TEST_IMAGE_TAG;
// var TEST_IMAGE_ID = child_process.execSync('docker inspect --format={{.Id}} ' + TEST_IMAGE).toString('utf8').trim();

var APP_STORE_ID = 'test', APP_ID;
var APP_LOCATION = 'appslocation';
var APP_LOCATION_2 = 'appslocationtwo';
var APP_LOCATION_NEW = 'appslocationnew';

var APP_MANIFEST = JSON.parse(fs.readFileSync(__dirname + '/../../../../test-app/CloudronManifest.json', 'utf8'));
APP_MANIFEST.dockerImage = TEST_IMAGE;

var APP_MANIFEST_1 = JSON.parse(fs.readFileSync(__dirname + '/../../../../test-app/CloudronManifest.json', 'utf8'));
APP_MANIFEST_1.dockerImage = TEST_IMAGE;

var USERNAME = 'superadmin', PASSWORD = 'Foobar?1337', EMAIL ='admin@me.com';
var USER_1_ID = null, USERNAME_1 = 'user', EMAIL_1 ='user@me.com';
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

function checkAddons(appEntry, done) {
    async.retry({ times: 15, interval: 3000 }, function (callback) {
        // this was previously written with superagent but it was getting sporadic EPIPE
        var req = http.get({ hostname: 'localhost', port: appEntry.httpPort, path: '/check_addons?username=' + USERNAME + '&password=' + PASSWORD });
        req.on('error', callback);
        req.on('response', function (res) {
            if (res.statusCode !== 200) return callback('app returned non-200 status : ' + res.statusCode);

            var d = '';
            res.on('data', function (chunk) { d += chunk.toString('utf8'); });
            res.on('end', function () {
                var body = JSON.parse(d);

                delete body.recvmail; // unclear why dovecot mail delivery won't work
                delete body.stdenv; // cannot access APP_ORIGIN

                for (var key in body) {
                    if (body[key] !== 'OK') return callback('Not done yet: ' + JSON.stringify(body));
                }

                callback();
            });
        });

        req.end();
    }, done);
}

function checkRedis(containerId, done) {
    var redisIp, exportedRedisPort;

    docker.getContainer(containerId).inspect(function (error, data) {
        expect(error).to.not.be.ok();
        expect(data).to.be.ok();

        redisIp = safe.query(data, 'NetworkSettings.Networks.cloudron.IPAddress');
        expect(redisIp).to.be.ok();

        exportedRedisPort = safe.query(data, 'NetworkSettings.Ports.6379/tcp');
        expect(exportedRedisPort).to.be(null);

        done();
    });
}

describe('Apps', function () {
    this.timeout(100000);

    var dockerProxy;
    var imageDeleted = false;
    var imageCreated = false;

    before(function (done) {
        config._reset();

        process.env.TEST_CREATE_INFRA = 1;

        safe.fs.unlinkSync(paths.INFRA_VERSION_FILE);
        child_process.execSync('docker ps -qa | xargs --no-run-if-empty docker rm -f');

        async.series([
            // first clear, then start server. otherwise, taskmanager spins up tasks for obsolete appIds
            database.initialize,
            database._clear,

            server.start.bind(server),
            ldap.start,
            simpleauth.start,

            function (callback) {
                var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                       .query({ setupToken: 'somesetuptoken' })
                       .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                       .end(function (error, result) {
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
                superagent.post(SERVER_URL + '/api/v1/users')
                       .query({ access_token: token })
                       .send({ username: USERNAME_1, email: EMAIL_1, invite: false })
                       .end(function (err, res) {
                    expect(res.statusCode).to.equal(201);

                    USER_1_ID = res.body.id;

                    callback(null);
                });
            },

            function (callback) {
                token_1 = tokendb.generateToken();

                // HACK to get a token for second user (passwords are generated and the user should have gotten a password setup link...)
                tokendb.add(token_1, USER_1_ID, 'test-client-id',  Date.now() + 100000, '*', callback);
            },

            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=' + encodeURIComponent(TEST_IMAGE_REPO) + '&tag=' + TEST_IMAGE_TAG) {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/' + TEST_IMAGE + '?force=false&noprune=false') {
                        imageDeleted = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    }
                    return false;
                }, callback);
            },

            settings.setDnsConfig.bind(null, { provider: 'route53', accessKeyId: 'accessKeyId', secretAccessKey: 'secretAccessKey', endpoint: 'http://localhost:5353' }),
            settings.setTlsConfig.bind(null, { provider: 'caas' }),
            settings.setBackupConfig.bind(null, { provider: 'caas', token: 'BACKUP_TOKEN', bucket: 'Bucket', prefix: 'Prefix' })
        ], function (error) {
            if (error) return done(error);

            console.log('This test can take ~40 seconds to start as it waits for infra to be ready');
            setTimeout(done, 40000);
        });
    });

    after(function (done) {
        delete process.env.TEST_CREATE_INFRA;

        // child_process.execSync('docker ps -qa | xargs --no-run-if-empty docker rm -f');
        dockerProxy.close(function () { });

        // db is not cleaned up here since it's too late to call it after server.stop. if called before server.stop taskmanager apptasks are unhappy :/
        async.series([
            taskmanager.stopPendingTasks,
            taskmanager.waitForPendingTasks,
            server.stop,
            ldap.stop,
            simpleauth.stop,
            config._reset,
        ], done);
    });

    describe('App API', function () {
        after(function (done) {
            appdb._clear(done); // TODO: test proper uninstall (requires mock for aws)
        });

        it('app install fails - missing manifest', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('appStoreId or manifest is required');
                done();
            });
        });

        it('app install fails - null manifest', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: null, password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('appStoreId or manifest is required');
                done();
            });
        });

        it('app install fails - bad manifest format', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: 'epic', password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('manifest must be an object');
                done();
            });
        });

        it('app install fails - empty appStoreId format', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: null, appStoreId: '', password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('appStoreId or manifest is required');
                done();
            });
        });

       it('app install fails - invalid json', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send('garbage')
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('app install fails - invalid location', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: '!awesome', accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('Hostname can only contain alphanumerics and hyphen');
                done();
            });
        });

        it('app install fails - invalid location type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: 42, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('location is required');
                done();
            });
        });

        it('app install fails - reserved admin location', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: constants.ADMIN_LOCATION, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql(constants.ADMIN_LOCATION + ' is reserved');
                done();
            });
        });

        it('app install fails - reserved api location', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: constants.API_LOCATION, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql(constants.API_LOCATION + ' is reserved');
                done();
            });
        });

        it('app install fails - portBindings must be object', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: 23, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('portBindings must be an object');
                done();
            });
        });

        it('app install fails - accessRestriction is required', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: {} })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('accessRestriction is required');
                done();
            });
        });

        it('app install fails - accessRestriction type is wrong', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: {}, accessRestriction: '' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(res.body.message).to.eql('accessRestriction is required');
                done();
            });
        });

        it('app install fails for non admin', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token_1 })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('app install fails because manifest download fails', function (done) {
            var fake = nock(config.apiServerOrigin()).get('/api/v1/apps/test').reply(404, {});

            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ appStoreId: APP_STORE_ID, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: { users: [ 'someuser' ], groups: [] } })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                expect(fake.isDone()).to.be.ok();
                done();
            });
        });

        it('app install fails due to purchase failure', function (done) {
            var fake1 = nock(config.apiServerOrigin()).get('/api/v1/apps/test').reply(200, { manifest: APP_MANIFEST });
            var fake2 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(403);

            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ appStoreId: APP_STORE_ID, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(503);
                expect(fake1.isDone()).to.be.ok();
                expect(fake2.isDone()).to.be.ok();
                done();
            });
        });

        it('app install succeeds with purchase', function (done) {
            var fake1 = nock(config.apiServerOrigin()).get('/api/v1/apps/' + APP_STORE_ID).reply(200, { manifest: APP_MANIFEST });
            var fake2 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake3 = nock(config.apiServerOrigin()).post(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }, { 'appstoreId': APP_STORE_ID }).reply(201, { });

            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ appStoreId: APP_STORE_ID, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: { users: [ 'someuser' ], groups: [] } })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                expect(res.body.id).to.be.a('string');
                APP_ID = res.body.id;
                expect(fake1.isDone()).to.be.ok();
                done();
            });
        });

        it('app install fails because of conflicting location', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(409);
                done();
            });
        });

        it('can get app status', function (done) {
            superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.id).to.eql(APP_ID);
                expect(res.body.installationState).to.be.ok();
                done();
             });
        });

        it('cannot get invalid app status', function (done) {
            superagent.get(SERVER_URL + '/api/v1/apps/kubachi')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(404);
                done();
             });
        });

        it('can get all apps', function (done) {
            superagent.get(SERVER_URL + '/api/v1/apps')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.apps).to.be.an('array');
                expect(res.body.apps[0].id).to.eql(APP_ID);
                expect(res.body.apps[0].installationState).to.be.ok();
                done();
             });
        });

        it('non admin cannot see the app due to accessRestriction', function (done) {
            superagent.get(SERVER_URL + '/api/v1/apps')
                   .query({ access_token: token_1 })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.apps).to.be.an('array');
                expect(res.body.apps.length).to.equal(0);
                done();
             });
        });

        it('cannot uninstall invalid app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/whatever/uninstall')
                .send({ password: PASSWORD })
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('cannot uninstall app without password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot uninstall app with wrong password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
                .send({ password: PASSWORD+PASSWORD })
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('non admin cannot uninstall app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
                .send({ password: PASSWORD })
                .query({ access_token: token_1 })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('can uninstall app', function (done) {
            var fake1 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake2 = nock(config.apiServerOrigin()).get(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }).reply(200, { });
            var fake3 = nock(config.apiServerOrigin()).delete(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }).reply(204, { });

            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
                .send({ password: PASSWORD })
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                done();
            });
        });

        it('app install succeeds again', function (done) {
            var fake1 = nock(config.apiServerOrigin()).get('/api/v1/apps/' + APP_STORE_ID).reply(200, { manifest: APP_MANIFEST });
            var fake2 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake3 = nock(config.apiServerOrigin()).post(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }, { 'appstoreId': APP_STORE_ID }).reply(201, { });

            superagent.post(SERVER_URL + '/api/v1/apps/install')
                   .query({ access_token: token })
                   .send({ appStoreId: APP_STORE_ID, password: PASSWORD, location: APP_LOCATION_2, portBindings: null, accessRestriction: null })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                expect(res.body.id).to.be.a('string');
                APP_ID = res.body.id;
                expect(fake1.isDone()).to.be.ok();
                done();
            });
        });

        it('app install succeeds without password but developer token', function (done) {
            settings.setDeveloperMode(true, function (error) {
                expect(error).to.be(null);

                superagent.post(SERVER_URL + '/api/v1/developer/login')
                       .send({ username: USERNAME, password: PASSWORD })
                       .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(200);
                    expect(new Date(result.body.expiresAt).toString()).to.not.be('Invalid Date');
                    expect(result.body.token).to.be.a('string');

                    // overwrite non dev token
                    token = result.body.token;

                    superagent.post(SERVER_URL + '/api/v1/apps/install')
                           .query({ access_token: token })
                           .send({ manifest: APP_MANIFEST, location: APP_LOCATION+APP_LOCATION, portBindings: null, accessRestriction: null })
                           .end(function (err, res) {
                        expect(res.statusCode).to.equal(202);
                        expect(res.body.id).to.be.a('string');
                        APP_ID = res.body.id;
                        done();
                    });
                });
            });
        });

        it('can uninstall app without password but developer token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                done();
            });
        });
    });

    describe('App installation', function () {
        this.timeout(50000);

        var apiHockInstance = hock.createHock({ throwOnUnmatched: false }), apiHockServer;
        var awsHockInstance = hock.createHock({ throwOnUnmatched: false }), awsHockServer;

        before(function (done) {
            APP_ID = uuid.v4();

            imageDeleted = false;
            imageCreated = false;

            async.series([
                function (callback) {
                    apiHockInstance
                        .get('/api/v1/apps/' + APP_STORE_ID + '/versions/' + APP_MANIFEST.version + '/icon')
                        .replyWithFile(200, path.resolve(__dirname, '../../../webadmin/src/img/appicon_fallback.png'));

                    var port = parseInt(url.parse(config.apiServerOrigin()).port, 10);
                    apiHockServer = http.createServer(apiHockInstance.handler).listen(port, callback);
                },

                function (callback) {
                    awsHockInstance
                        .get('/2013-04-01/hostedzone')
                        .max(Infinity)
                        .reply(200, js2xml('ListHostedZonesResponse', awsHostedZones, { arrayMap: { HostedZones: 'HostedZone'} }), { 'Content-Type': 'application/xml' })
                        .get('/2013-04-01/hostedzone/ZONEID/rrset?maxitems=1&name=appslocation.localhost.&type=A')
                        .max(Infinity)
                        .reply(200, js2xml('ListResourceRecordSetsResponse', { ResourceRecordSets: [ ] }, { 'Content-Type': 'application/xml' }))
                        .filteringRequestBody(function (unusedBody) { return ''; }) // strip out body
                        .post('/2013-04-01/hostedzone/ZONEID/rrset/')
                        .max(Infinity)
                        .reply(200, js2xml('ChangeResourceRecordSetsResponse', { ChangeInfo: { Id: 'dnsrecordid', Status: 'INSYNC' } }), { 'Content-Type': 'application/xml' });

                    awsHockServer = http.createServer(awsHockInstance.handler).listen(5353, callback);
                }
            ], done);
        });

        after(function (done) {
            APP_ID = null;

            async.series([
                apiHockServer.close.bind(apiHockServer),
                awsHockServer.close.bind(awsHockServer)
            ], done);
        });

        var appResult = null /* the json response */, appEntry = null /* entry from database */;

        it('can install test app', function (done) {
            var fake1 = nock(config.apiServerOrigin()).get('/api/v1/apps/' + APP_STORE_ID).reply(200, { manifest: APP_MANIFEST });
            var fake2 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake3 = nock(config.apiServerOrigin()).post(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }, { 'appstoreId': APP_STORE_ID }).reply(201, { });

            var count = 0;
            function checkInstallStatus() {
                superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
                   .query({ access_token: token })
                   .end(function (err, res) {
                    expect(res.statusCode).to.equal(200);
                    if (res.body.installationState === appdb.ISTATE_INSTALLED) { appResult = res.body; return done(null); }
                    if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                    if (++count > 50) return done(new Error('Timedout'));
                    setTimeout(checkInstallStatus, 1000);
                });
            }

            superagent.post(SERVER_URL + '/api/v1/apps/install')
                  .query({ access_token: token })
                  .send({ appStoreId: APP_STORE_ID, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: null })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                expect(fake1.isDone()).to.be.ok();
                expect(res.body.id).to.be.a('string');
                APP_ID = res.body.id;
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
                expect(data.Config.Env).to.contain('APP_ORIGIN=https://' + config.appFqdn(APP_LOCATION));
                expect(data.Config.Env).to.contain('APP_DOMAIN=' + config.appFqdn(APP_LOCATION));
                // Hostname must not be set of app fqdn or app location!
                expect(data.Config.Hostname).to.not.contain(APP_LOCATION);
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

        it('installation - is up and running', function (done) {
            expect(appResult.httpPort).to.be(undefined);
            setTimeout(function () {
                superagent.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
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

                // support newer docker versions
                if (data.Volumes) {
                    expect(data.Volumes['/app/data']).to.eql(paths.DATA_DIR + '/' + APP_ID + '/data');
                } else {
                    expect(data.Mounts.filter(function (mount) { return mount.Destination === '/app/data'; })[0].Source).to.eql(paths.DATA_DIR + '/' + APP_ID + '/data');
                }

                done();
            });
        });

        it('installation - app responnds to http request', function (done) {
            superagent.get('http://localhost:' + appEntry.httpPort).end(function (err, res) {
                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                expect(res.body.status).to.be('OK');
                done();
            });
        });

        it('installation - oauth addon config', function (done) {
            var appContainer = docker.getContainer(appEntry.containerId);
            appContainer.inspect(function (error, data) {
                expect(error).to.not.be.ok();

                clients.getByAppIdAndType(APP_ID, clients.TYPE_OAUTH, function (error, client) {
                    expect(error).to.not.be.ok();
                    expect(client.id.length).to.be(40); // cid- + 32 hex chars (128 bits) + 4 hyphens
                    expect(client.clientSecret.length).to.be(256); // 32 hex chars (8 * 256 bits)
                    expect(data.Config.Env).to.contain('OAUTH_CLIENT_ID=' + client.id);
                    expect(data.Config.Env).to.contain('OAUTH_CLIENT_SECRET=' + client.clientSecret);
                    done();
                });
            });
        });

        it('installation - app can populate addons', function (done) {
            superagent.get('http://localhost:' + appEntry.httpPort + '/populate_addons').end(function (err, res) {
                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                for (var key in res.body) {
                    expect(res.body[key]).to.be('OK');
                }
                done();
            });
        });

        it('installation - app can check addons', function (done) {
            this.timeout(120000);
            console.log('This test can take a while as it waits for scheduler addon to tick 1');
            checkAddons(appEntry, done);
        });

        it('installation - redis addon created', function (done) {
            checkRedis('redis-' + APP_ID, done);
        });

        xit('logs - stdout and stderr', function (done) {
            superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID + '/logs')
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

        xit('logStream - requires event-stream accept header', function (done) {
            superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID + '/logstream')
                .query({ access_token: token, fromLine: 0 })
                .end(function (err, res) {
                expect(res.statusCode).to.be(400);
                done();
            });
        });


        xit('logStream - stream logs', function (done) {
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
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/stop')
                .query({ access_token: token_1 })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('can stop app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/stop')
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                done();
            });
        });

        it('did stop the app', function (done) {
            function waitForAppToDie() {
                superagent.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath).end(function (err, res) {
                    if (!err || err.code !== 'ECONNREFUSED') return setTimeout(waitForAppToDie, 500);

                    // wait for app status to be updated
                    superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID).query({ access_token: token_1 }).end(function (error, result) {
                        if (error || result.statusCode !== 200 || result.body.runState !== 'stopped') return setTimeout(waitForAppToDie, 500);
                        done();
                    });
                });
            }

            waitForAppToDie();
        });

        it('nonadmin cannot start app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/start')
                .query({ access_token: token_1 })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('can start app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/start')
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                done();
            });
        });

        it('did start the app', function (done) {
            var count = 0;
            function checkStartState() {
                superagent.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
                    .end(function (err, res) {
                    if (res && res.statusCode === 200) return done();
                    if (++count > 50) return done(new Error('Timedout'));
                    setTimeout(checkStartState, 500);
                });
            }

            checkStartState();
        });

        it('installation - app can check addons', function (done) {
            this.timeout(120000);
            console.log('This test can take a while as it waits for scheduler addon to tick 2');
            checkAddons(appEntry, done);
        });

        it('can uninstall app', function (done) {
            var fake1 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake2 = nock(config.apiServerOrigin()).get(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }).reply(200, { });
            var fake3 = nock(config.apiServerOrigin()).delete(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }).reply(204, { });

            var count = 0;
            function checkUninstallStatus() {
                superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
                   .query({ access_token: token })
                   .end(function (err, res) {
                    if (res.statusCode === 404) return done(null);
                    if (++count > 50) return done(new Error('Timedout'));
                    setTimeout(checkUninstallStatus, 1000);
                });
            }

            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
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

        var apiHockInstance = hock.createHock({ throwOnUnmatched: false }), apiHockServer;
        var awsHockInstance = hock.createHock({ throwOnUnmatched: false }), awsHockServer;

        // *.foobar.com
        var validCert1, validKey1;

        before(function (done) {
            imageDeleted = false;
            imageCreated = false;

            child_process.execSync('openssl req -subj "/CN=*.foobar.com/O=My Company Name LTD./C=US" -new -newkey rsa:2048 -days 365 -nodes -x509 -keyout /tmp/server.key -out /tmp/server.crt');
            validKey1 = fs.readFileSync('/tmp/server.key', 'utf8');
            validCert1 = fs.readFileSync('/tmp/server.crt', 'utf8');

            APP_ID = uuid.v4();

            async.series([
                function (callback) {
                    config.set('fqdn', 'test.foobar.com');
                    callback();
                },

                function (callback) {
                    apiHockInstance
                        .get('/api/v1/apps/' + APP_STORE_ID + '/versions/' + APP_MANIFEST.version + '/icon')
                        .replyWithFile(200, path.resolve(__dirname, '../../../webadmin/src/img/appicon_fallback.png'));

                    var port = parseInt(url.parse(config.apiServerOrigin()).port, 10);
                    apiHockServer = http.createServer(apiHockInstance.handler).listen(port, callback);
                },

                settings.setDnsConfig.bind(null, { provider: 'route53', accessKeyId: 'accessKeyId', secretAccessKey: 'secretAccessKey', endpoint: 'http://localhost:5353' }),

                settings.setTlsConfig.bind(null, { provider: 'caas' }),

                function (callback) {
                    awsHockInstance
                        .get('/2013-04-01/hostedzone')
                        .max(Infinity)
                        .reply(200, js2xml('ListHostedZonesResponse', awsHostedZones, { arrayMap: { HostedZones: 'HostedZone'} }), { 'Content-Type': 'application/xml' })
                        .filteringPathRegEx(/name=[^&]*/, 'name=location')
                        .get('/2013-04-01/hostedzone/ZONEID/rrset?maxitems=1&name=location&type=A')
                        .max(Infinity)
                        .reply(200, js2xml('ListResourceRecordSetsResponse', { ResourceRecordSets: [ ] }, { 'Content-Type': 'application/xml' }))
                        .filteringRequestBody(function (unusedBody) { return ''; }) // strip out body
                        .post('/2013-04-01/hostedzone/ZONEID/rrset/')
                        .max(Infinity)
                        .reply(200, js2xml('ChangeResourceRecordSetsResponse', { ChangeInfo: { Id: 'dnsrecordid', Status: 'INSYNC' } }), { 'Content-Type': 'application/xml' });

                    awsHockServer = http.createServer(awsHockInstance.handler).listen(5353, callback);
                }
            ], done);
        });

        after(function (done) {
            APP_ID = null;
            async.series([
                apiHockServer.close.bind(apiHockServer),
                awsHockServer.close.bind(awsHockServer)
            ], done);
        });

        var appResult = null, appEntry = null;

        it('can install test app', function (done) {
            var fake1 = nock(config.apiServerOrigin()).get('/api/v1/apps/' + APP_STORE_ID).reply(200, { manifest: APP_MANIFEST });
            var fake2 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake3 = nock(config.apiServerOrigin()).post(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }, { 'appstoreId': APP_STORE_ID }).reply(201, { });

            var count = 0;
            function checkInstallStatus() {
                superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
                   .query({ access_token: token })
                   .end(function (err, res) {
                    expect(res.statusCode).to.equal(200);
                    if (res.body.installationState === appdb.ISTATE_INSTALLED) { appResult = res.body; return done(null); }
                    if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                    if (++count > 50) return done(new Error('Timedout'));
                    setTimeout(checkInstallStatus, 1000);
                });
            }

            superagent.post(SERVER_URL + '/api/v1/apps/install')
                  .query({ access_token: token })
                  .send({ appStoreId: APP_STORE_ID, password: PASSWORD, location: APP_LOCATION, portBindings: { ECHO_SERVER_PORT: 7171 }, accessRestriction: null })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                expect(fake1.isDone()).to.be.ok();
                APP_ID = res.body.id;
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
                superagent.get('http://localhost:' + appEntry.httpPort + appResult.manifest.healthCheckPath)
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

                // support newer docker versions
                if (data.Volumes) {
                    expect(data.Volumes['/app/data']).to.eql(paths.DATA_DIR + '/' + APP_ID + '/data');
                } else {
                    expect(data.Mounts.filter(function (mount) { return mount.Destination === '/app/data'; })[0].Source).to.eql(paths.DATA_DIR + '/' + APP_ID + '/data');
                }

                done();
            });
        });


        it('installation - app can populate addons', function (done) {
            superagent.get('http://localhost:' + appEntry.httpPort + '/populate_addons').end(function (err, res) {
                expect(!err).to.be.ok();
                expect(res.statusCode).to.equal(200);
                for (var key in res.body) {
                    expect(res.body[key]).to.be('OK');
                }
                done();
            });
        });

        it('installation - app can check addons', function (done) {
            this.timeout(120000);
            console.log('This test can take a while as it waits for scheduler addon to tick 3');
            checkAddons(appEntry, done);
        });

        it('installation - redis addon created', function (done) {
            checkRedis('redis-' + APP_ID, done);
        });

        function checkConfigureStatus(count, done) {
            assert.strictEqual(typeof count, 'number');
            assert.strictEqual(typeof done, 'function');

            superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appResult = res.body; expect(appResult).to.be.ok(); return done(null); }
                if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkConfigureStatus.bind(null, count, done), 1000);
            });
        }

        it('cannot reconfigure app with bad location', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: 1234, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: null })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot reconfigure app with bad accessRestriction', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: false })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot reconfigure app with only the cert, no key', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: null, cert: validCert1 })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot reconfigure app with only the key, no cert', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, key: validKey1 })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot reconfigure app with cert not being a string', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: null, cert: 1234, key: validKey1 })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot reconfigure app with key not being a string', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, cert: validCert1, key: 1234 })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('non admin cannot reconfigure app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token_1 })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: null })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('can reconfigure app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 } })
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
                expect(appEntry.containerId).to.not.be(oldContainerId);
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
            checkRedis('redis-' + APP_ID, done);
        });

        it('installation - app can check addons', function (done) {
            this.timeout(120000);
            console.log('This test can take a while as it waits for scheduler addon to tick 4');
            checkAddons(appEntry, done);
        });

        it('can reconfigure app with custom certificate', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
                  .query({ access_token: token })
                  .send({ password: PASSWORD, location: APP_LOCATION_NEW, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: null, cert: validCert1, key: validKey1 })
                  .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                checkConfigureStatus(0, done);
            });
        });

        it('can stop app', function (done) {
            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/stop')
                .query({ access_token: token })
                .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                done();
            });
        });

        // osx: if this test is failing, it is probably because of a stray port binding in boot2docker
        it('did stop the app', function (done) {
            var timer1, timer2;

            function finished() {
                clearTimeout(timer1);
                clearTimeout(timer2);

                if (done) done();

                // avoid double callbacks
                done = null;
            }

            function waitForAppToDie() {
                var client = net.connect(7171);
                client.setTimeout(2000);
                client.on('connect', function () {
                    timer1 = setTimeout(waitForAppToDie, 1000);
                });
                client.on('timeout', function () { finished(); });
                client.on('error', function (error) { finished(); });
                client.on('data', function (data) {
                    timer2 = setTimeout(waitForAppToDie, 1000);
                });
            }

            waitForAppToDie();
        });

        it('can uninstall app', function (done) {
            var fake1 = nock(config.apiServerOrigin()).post('/api/v1/exchangeBoxTokenWithUserToken?token=APPSTORE_TOKEN').reply(201, { userId: 'USER_ID', cloudronId: 'CLOUDRON_ID', token: 'ACCESS_TOKEN' });
            var fake2 = nock(config.apiServerOrigin()).get(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }).reply(200, { });
            var fake3 = nock(config.apiServerOrigin()).delete(function (uri) { return uri.indexOf('/api/v1/users/USER_ID/cloudrons/CLOUDRON_ID/apps/') >= 0; }).reply(204, { });

            var count = 0;
            function checkUninstallStatus() {
                superagent.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
                   .query({ access_token: token })
                   .end(function (err, res) {
                    if (res.statusCode === 404) return done(null);
                    if (++count > 50) return done(new Error('Timedout'));
                    setTimeout(checkUninstallStatus, 1000);
                });
            }

            superagent.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
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
});
