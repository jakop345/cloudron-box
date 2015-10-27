/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../../appdb.js'),
    async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    path = require('path'),
    paths = require('../../paths.js'),
    request = require('superagent'),
    server = require('../../server.js'),
    settings = require('../../settings.js'),
    fs = require('fs'),
    nock = require('nock'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var token = null;

var server;
function setup(done) {
    async.series([
        server.start.bind(server),

        userdb._clear,

        function createAdmin(callback) {
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

                // stash token for further use
                token = result.body.token;

                callback();
            });
        },

        function addApp(callback) {
            var manifest = { version: '0.0.1', manifestVersion: 1, dockerImage: 'foo', healthCheckPath: '/', httpPort: 3, title: 'ok' };
            appdb.add('appid', 'appStoreId', manifest, 'location', [ ] /* portBindings */, null /* accessRestriction */, false /* oauthProxy */, callback);
        }
    ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('Settings API', function () {
    this.timeout(10000);

    before(setup);
    after(cleanup);

    describe('autoupdate_pattern', function () {
        it('can get auto update pattern (default)', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/autoupdate_pattern')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.pattern).to.be.ok();
                done(err);
            });
        });

        it('cannot set autoupdate_pattern without pattern', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/autoupdate_pattern')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('can set autoupdate_pattern', function (done) {
            var eventPattern = null;
            settings.events.on(settings.AUTOUPDATE_PATTERN_KEY, function (pattern) {
                eventPattern = pattern;
            });

            request.post(SERVER_URL + '/api/v1/settings/autoupdate_pattern')
                   .query({ access_token: token })
                   .send({ pattern: '00 30 11 * * 1-5' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(eventPattern === '00 30 11 * * 1-5').to.be.ok();
                done();
            });
        });

        it('can set autoupdate_pattern to never', function (done) {
            var eventPattern = null;
            settings.events.on(settings.AUTOUPDATE_PATTERN_KEY, function (pattern) {
                eventPattern = pattern;
            });

            request.post(SERVER_URL + '/api/v1/settings/autoupdate_pattern')
                   .query({ access_token: token })
                   .send({ pattern: 'never' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(eventPattern).to.eql('never');
                done();
            });
        });

        it('cannot set invalid autoupdate_pattern', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/autoupdate_pattern')
                   .query({ access_token: token })
                   .send({ pattern: '1 3 x 5 6' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });
    });

    describe('cloudron_name', function () {
        var name = 'foobar';

        it('get default succeeds', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/cloudron_name')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.name).to.be.ok();
                done(err);
            });
        });

        it('cannot set without name', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/cloudron_name')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set empty name', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/cloudron_name')
                   .query({ access_token: token })
                   .send({ name: '' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('set succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/cloudron_name')
                   .query({ access_token: token })
                   .send({ name: name })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('get succeeds', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/cloudron_name')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.name).to.eql(name);
                done(err);
            });
        });
    });

    describe('cloudron_avatar', function () {
        it('get default succeeds', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/cloudron_avatar')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body).to.be.a(Buffer);
                done(err);
            });
        });

        it('cannot set without data', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/cloudron_avatar')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('set succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/cloudron_avatar')
                   .query({ access_token: token })
                   .attach('avatar', paths.FAVICON_FILE)
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
                done();
            });
        });

        it('get succeeds', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/cloudron_avatar')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.toString()).to.eql(fs.readFileSync(paths.FAVICON_FILE, 'utf-8'));
                done(err);
            });
        });
    });

    describe('dns_config', function () {
        it('get dns_config fails', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/dns_config')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body).to.eql({});
                done(err);
            });
        });

        it('cannot set without data', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/dns_config')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('set succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/dns_config')
                   .query({ access_token: token })
                   .send({ provider: 'route53', accessKeyId: 'accessKey', secretAccessKey: 'secretAccessKey' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('get succeeds', function (done) {
            request.get(SERVER_URL + '/api/v1/settings/dns_config')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body).to.eql({ provider: 'route53', accessKeyId: 'accessKey', secretAccessKey: 'secretAccessKey', region: 'us-east-1', endpoint: null });
                done(err);
            });
        });
    });

    describe('Certificates API', function () {
        var certFile, keyFile;

        before(function () {
            certFile = '/tmp/host.cert';
            fs.writeFileSync(certFile, 'test certificate');

            keyFile = '/tmp/host.key';
            fs.writeFileSync(keyFile, 'test key');
        });

        after(function () {
            fs.unlinkSync(certFile);
            fs.unlinkSync(keyFile);
        });

        it('cannot set certificate without token', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot set certificate without certificate', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .attach('key', keyFile, 'key')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set certificate without key', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .attach('certificate', certFile, 'certificate')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('can set certificate', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .attach('key', keyFile, 'key')
                   .attach('certificate', certFile, 'certificate')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);
                done();
            });
        });

        it('did set the certificate', function (done) {
            var cert = fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'));
            expect(cert).to.eql(fs.readFileSync(certFile));

            var key = fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'));
            expect(key).to.eql(fs.readFileSync(keyFile));

            done();
        });
    });
});

