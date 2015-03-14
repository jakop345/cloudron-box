'use strict';

/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var appdb = require('../../appdb.js'),
    assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    clientdb = require('../../clientdb.js'),
    config = require('../../../config.js'),
    constants = require('../../../constants.js'),
    database = require('../../database.js'),
    docker = require('../../docker.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    hock = require('hock'),
    http = require('http'),
    https = require('https'),
    net = require('net'),
    nock = require('nock'),
    os = require('os'),
    paths = require('../../paths.js'),
    redis = require('redis'),
    request = require('superagent'),
    safe = require('safetydance'),
    server = require('../../server.js'),
    url = require('url'),
    userdb = require('../../userdb.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    _ = require('underscore');

var SERVER_URL = 'http://localhost:' + config.get('port');

var APP_STORE_ID = 'test', APP_ID;
var APP_LOCATION = 'appslocation';
var APP_MANIFEST = JSON.parse(fs.readFileSync(__dirname + '/CloudronManifest.json', 'utf8'));
var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var token = null; // authentication token

function startDockerProxy(interceptor, callback) {
    assert(typeof interceptor === 'function');

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
        server.start.bind(server),

        database._clear,

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
                expect(scope1.isDone());
                expect(scope2.isDone());

                // stash for further use
                token = result.body.token;

                callback();
            });
        },

        child_process.exec.bind(null, __dirname + '/start_addons.sh'),

        function (callback) {
            config.set('token', 'appstoretoken');
            config.set('addons.mysql.rootPassword', 'secret');
            config.set('addons.postgresql.rootPassword', 'secret');

            callback(null);
        }
    ], done);
}

function cleanup(done) {
    async.series([
        database._clear,

        server.stop,

        child_process.exec.bind(null, 'docker rm -f mysql; docker rm -f postgresql'),

        function (callback) {
            config.set('token', null);
            config.set('addons.mysql.rootPassword', null);
            config.set('addons.postgresql.rootPassword', null);

            callback();
        }
    ], done);
}

describe('App API', function () {
    this.timeout(50000);
    var dockerProxy;

    before(function (done) {
        dockerProxy = startDockerProxy(function interceptor() { return false; }, function () {
            setup(done);
        });
    });
    after(function (done) {
        APP_ID = null;
        cleanup(function () {
            dockerProxy.close(done);
        });
    });

    it('app install fails - missing password', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('API call requires user password');
            done(err);
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

    it('app install fails - invalid password type', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: 3.52, location: 'ninja', accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql('API call requires user password');
            done(err);
        });
    });

    it('app install fails - invalid password', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD + 'x', location: 'ninja', accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            expect(res.body.message).to.eql('Password incorrect');
            done(err);
        });
    });

    it('app install fails - reserved location', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: constants.ADMIN_LOCATION, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(res.body.message).to.eql(constants.ADMIN_LOCATION + ' is reserved');
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

    it('app install succeeds', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            expect(res.body.id).to.be.a('string');
            APP_ID = res.body.id;
            done(err);
        });
    });

    it('app install fails because of conflicting location', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/install')
               .query({ access_token: token })
               .send({ appStoreId: APP_STORE_ID, manifest: APP_MANIFEST, password: PASSWORD, location: APP_LOCATION, portBindings: null, accessRestriction: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(409);
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

    it('can uninstall app', function (done) {
        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/uninstall')
            .send({ password: PASSWORD })
            .query({ access_token: token })
            .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
            done(err);
        });
    });

    it('app install succeeds without password but developer token', function (done) {
        config.set('developerMode', true);

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
                APP_ID = res.body.id;
                done(err);
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

    var hockInstance = hock.createHock({ throwOnUnmatched: false }), hockServer, dockerProxy;
    var imageDeleted = false, imageCreated = false;

    before(function (done) {
        APP_ID = uuid.v4();

        async.series([
            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=girish%2Ftest&tag=0.8') {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/girish/test:0.8?force=true&noprune=false') {
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
                hockInstance
                    .post('/api/v1/subdomains?token=' + config.token(), { records: [ { subdomain: APP_LOCATION, type: 'A' } ] })
                    .reply(201, { ids: [ 'dnsrecordid' ] }, { 'Content-Type': 'application/json' })
                    .delete('/api/v1/subdomains/dnsrecordid?token=' + config.token())
                    .reply(204, { }, { 'Content-Type': 'application/json' });

                var port = parseInt(url.parse(config.apiServerOrigin()).port, 10);
                hockServer = http.createServer(hockInstance.handler).listen(port, callback);
            }
        ], done);
    });

    after(function (done) {
        APP_ID = null;
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
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appInfo = res.body; return done(null); }
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
            expect(res.body.id).to.be.a('string');
            expect(res.body.id).to.be.eql(APP_ID);
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
            expect(data.Config.Env).to.contain('ADMIN_ORIGIN=' + config.adminOrigin());
            expect(data.Config.Env).to.contain('CLOUDRON=1');
            clientdb.getByAppId('addon-' + appInfo.id, function (error, client) {
                expect(error).to.not.be.ok();
                expect(client.id.length).to.be(46); // cid-addon- + 32 hex chars (128 bits) + 4 hyphens
                expect(client.clientSecret.length).to.be(32); // 32 hex chars (128 bits)
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
        expect(fs.existsSync(paths.APPDATA_DIR + '/' + APP_ID));
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
            expect(data.Volumes['/app/data']).to.eql(paths.APPDATA_DIR + '/' + APP_ID);
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
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
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
        var appContainer = docker.getContainer(appInfo.containerId);
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
                expect(stderr.length).to.be(0);
                done();
            });
        });
    });

    it('installation - postgresql addon config', function (done) {
        var appContainer = docker.getContainer(appInfo.containerId);
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
        var req = request.get(SERVER_URL + '/api/v1/apps/' + APP_ID + '/logstream')
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
            request.get('http://localhost:' + appInfo.httpPort + appInfo.manifest.healthCheckPath)
                .end(function (err, res) {
                expect(err).to.be.ok();
                done();
            });
        }, 2000);
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
        expect(!fs.existsSync(paths.APPDATA_DIR + '/' + APP_ID));
        done();
    });

    it('uninstalled - unregistered subdomain', function (done) {
        hockInstance.done(function (error) { // checks if all the hockServer APIs were called
            expect(!error).to.be.ok();
            done();
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

    var hockInstance = hock.createHock({ throwOnUnmatched: false }), hockServer, dockerProxy;
    var imageDeleted = false, imageCreated = false;

    before(function (done) {
        APP_ID = uuid.v4();
        async.series([
            function (callback) {
                dockerProxy = startDockerProxy(function interceptor(req, res) {
                    if (req.method === 'POST' && req.url === '/images/create?fromImage=girish%2Ftest&tag=0.8') {
                        imageCreated = true;
                        res.writeHead(200);
                        res.end();
                        return true;
                    } else if (req.method === 'DELETE' && req.url === '/images/girish/test:0.8?force=true&noprune=false') {
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
                hockInstance
                    // app install
                    .post('/api/v1/subdomains?token=' + config.token(), { records: [ { subdomain: APP_LOCATION, type: 'A' } ] })
                    .reply(201, { ids: [ 'dnsrecordid' ] }, { 'Content-Type': 'application/json' })
                    // app configure
                    .delete('/api/v1/subdomains/dnsrecordid?token=' + config.token())
                    .reply(204, { }, { 'Content-Type': 'application/json' })
                    .post('/api/v1/subdomains?token=' + config.token(), { records: [ { subdomain: APP_LOCATION, type: 'A' } ] })
                    .reply(201, { ids: [ 'anotherdnsid' ] }, { 'Content-Type': 'application/json' })
                    // app remove
                    .delete('/api/v1/subdomains/anotherdnsid?token=' + config.token())
                    .reply(204, { }, { 'Content-Type': 'application/json' });

                var port = parseInt(url.parse(config.apiServerOrigin()).port, 10);
                hockServer = http.createServer(hockInstance.handler).listen(port, callback);
            }
        ], done);
    });

    after(function (done) {
        APP_ID = null;
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
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appInfo = res.body; return done(null); }
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
            expect(res.body.id).to.equal(APP_ID);
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
        expect(fs.existsSync(paths.NGINX_APPCONFIG_DIR + '/' + APP_LOCATION + '.conf'));
        done();
    });

    it('installation - registered subdomain', function (done) {
        // this is checked in unregister subdomain testcase
        done();
    });

    it('installation - volume created', function (done) {
        expect(fs.existsSync(paths.APPDATA_DIR + '/' + APP_ID));
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
            expect(data.Volumes['/app/data']).to.eql(paths.APPDATA_DIR + '/' + APP_ID);
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
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
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

    it('can reconfigure app', function (done) {
        var count = 0;
        function checkConfigureStatus() {
            request.get(SERVER_URL + '/api/v1/apps/' + APP_ID)
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                if (res.body.installationState === appdb.ISTATE_INSTALLED) { appInfo = res.body; expect(appInfo).to.be.ok(); return done(null); }
                if (res.body.installationState === appdb.ISTATE_ERROR) return done(new Error('Install error'));
                if (++count > 50) return done(new Error('Timedout'));
                setTimeout(checkConfigureStatus, 1000);
            });
        }

        request.post(SERVER_URL + '/api/v1/apps/' + APP_ID + '/configure')
              .query({ access_token: token })
              .send({ appId: APP_ID, password: PASSWORD, portBindings: { ECHO_SERVER_PORT: 7172 }, accessRestriction: 'roleAdmin' })
              .end(function (err, res) {
            expect(res.statusCode).to.equal(202);
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

    var redisIp, exportedRedisPort;

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
        docker.getContainer(appInfo.containerId).inspect(function (error, data) {
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
        expect(!fs.existsSync(paths.APPDATA_DIR + '/' + APP_ID));
        done();
    });

    it('uninstalled - unregistered subdomain', function (done) {
        hockInstance.done(function (error) { // checks if all the hockServer APIs were called
            expect(!error).to.be.ok();
            done();
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

