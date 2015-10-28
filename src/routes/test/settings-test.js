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
    config.set('fqdn', 'foobar.com');

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
        // foobar.com
        var validCert0 = '-----BEGIN CERTIFICATE-----\nMIIBujCCAWQCCQCjLyTKzAJ4FDANBgkqhkiG9w0BAQsFADBkMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzETMBEGA1UEAwwKZm9vYmFyLmNvbTAeFw0xNTEw\nMjgxMjM5MjZaFw0xNjEwMjcxMjM5MjZaMGQxCzAJBgNVBAYTAkRFMQ8wDQYDVQQI\nDAZCZXJsaW4xDzANBgNVBAcMBkJlcmxpbjEQMA4GA1UECgwHTmVidWxvbjEMMAoG\nA1UECwwDQ1RPMRMwEQYDVQQDDApmb29iYXIuY29tMFwwDQYJKoZIhvcNAQEBBQAD\nSwAwSAJBAMeYofgwHeNVmGkGe0gj4dnX2ciifDi7X2K/oVHp7mxuHjGMSYP9Z7b6\n+mu0IMf4OedwXStHBeO8mwjKxZmE7p8CAwEAATANBgkqhkiG9w0BAQsFAANBAJI7\nFUUHXjR63UFk8pgxp0c7hEGqj4VWWGsmo8oZnnX8jGVmQDKbk8o3MtDujfqupmMR\nMo7tSAFlG7zkm3GYhpw=\n-----END CERTIFICATE-----';
        var validKey0 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOwIBAAJBAMeYofgwHeNVmGkGe0gj4dnX2ciifDi7X2K/oVHp7mxuHjGMSYP9\nZ7b6+mu0IMf4OedwXStHBeO8mwjKxZmE7p8CAwEAAQJBAJS59Sb8o6i8JT9NJxvQ\nMQCkSJGqEaosZJ0uccSZ7aE48v+H7HiPzXAueitohcEif2Wp1EZ1RbRMURhznNiZ\neLECIQDxxqhakO6wc7H68zmpRXJ5ZxGUNbM24AMtpONAtEw9iwIhANNWtp6P74OV\ntvfOmtubbqw768fmGskFCOcp5oF8oF29AiBkTAf9AhCyjFwyAYJTEScq67HkLN66\njfVjkvpfFixmfwIgI+xldmZ5DCDyzQSthg7RrS0yUvRmMS1N6h1RNUl96PECIQDl\nit4lFcytbqNo1PuBZvzQE+plCjiJqXHYo3WCst1Jbg==\n-----END RSA PRIVATE KEY-----';

        // *.foobar.com
        var validCert1 = '-----BEGIN CERTIFICATE-----\nMIIBvjCCAWgCCQCg957GWuHtbzANBgkqhkiG9w0BAQsFADBmMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzEVMBMGA1UEAwwMKi5mb29iYXIuY29tMB4XDTE1\nMTAyODEzMDI1MFoXDTE2MTAyNzEzMDI1MFowZjELMAkGA1UEBhMCREUxDzANBgNV\nBAgMBkJlcmxpbjEPMA0GA1UEBwwGQmVybGluMRAwDgYDVQQKDAdOZWJ1bG9uMQww\nCgYDVQQLDANDVE8xFTATBgNVBAMMDCouZm9vYmFyLmNvbTBcMA0GCSqGSIb3DQEB\nAQUAA0sAMEgCQQC0FKf07ZWMcABFlZw+GzXK9EiZrlJ1lpnu64RhN99z7MXRr8cF\nnZVgY3jgatuyR5s3WdzUvye2eJ0rNicl2EZJAgMBAAEwDQYJKoZIhvcNAQELBQAD\nQQAw4bteMZAeJWl2wgNLw+wTwAH96E0jyxwreCnT5AxJLmgimyQ0XOF4FsssdRFj\nxD9WA+rktelBodJyPeTDNhIh\n-----END CERTIFICATE-----';
        var validKey1 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOQIBAAJBALQUp/TtlYxwAEWVnD4bNcr0SJmuUnWWme7rhGE333PsxdGvxwWd\nlWBjeOBq27JHmzdZ3NS/J7Z4nSs2JyXYRkkCAwEAAQJALV2eykcoC48TonQEPmkg\nbhaIS57syw67jMLsQImQ02UABKzqHPEKLXPOZhZPS9hsC/hGIehwiYCXMUlrl+WF\nAQIhAOntBI6qaecNjAAVG7UbZclMuHROUONmZUF1KNq6VyV5AiEAxRLkfHWy52CM\njOQrX347edZ30f4QczvugXwsyuU9A1ECIGlGZ8Sk4OBA8n6fAUcyO06qnmCJVlHg\npTUeOvKk5c9RAiBs28+8dCNbrbhVhx/yQr9FwNM0+ttJW/yWJ+pyNQhr0QIgJTT6\nxwCWYOtbioyt7B9l+ENy3AMSO3Uq+xmIKkvItK4=\n-----END RSA PRIVATE KEY-----';

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
                   .send({ key: validKey1 })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set certificate without key', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .send({ cert: validCert1 })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set certificate with cert not being a string', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .send({ cert: 1234, key: validKey1 })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set certificate with key not being a string', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .send({ cert: validCert1, key: true })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set non wildcard certificate', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .send({ cert: validCert0, key: validKey0 })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('can set certificate', function (done) {
            request.post(SERVER_URL + '/api/v1/settings/certificate')
                   .query({ access_token: token })
                   .send({ cert: validCert1, key: validKey1 })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);
                done();
            });
        });

        it('did set the certificate', function (done) {
            var cert = fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), 'utf-8');
            expect(cert).to.eql(validCert1);

            var key = fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), 'utf-8');
            expect(key).to.eql(validKey1);

            done();
        });
    });
});

