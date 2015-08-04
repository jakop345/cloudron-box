'use strict';

/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    nock = require('nock'),
    paths = require('../../paths.js'),
    request = require('superagent'),
    server = require('../../server.js'),
    shell = require('../../shell.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var token = null; // authentication token

var server;
function setup(done) {
    nock.cleanAll();
    config.set('version', '0.5.0');
    server.start(done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(error).to.not.be.ok();

        server.stop(done);
    });
}

var gSudoOriginal = null;
function injectShellMock() {
    gSudoOriginal = shell.sudo;
    shell.sudo = function (tag, options, callback) { callback(null); };
}

function restoreShellMock() {
    shell.sudo = gSudoOriginal;
}

describe('Cloudron', function () {

    describe('activate', function () {

        before(setup);
        after(cleanup);

        it('fails due to missing setupToken', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .send({ username: '', password: 'somepassword', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to empty username', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: '', password: 'somepassword', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to empty password', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: '', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to empty email', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'somepassword', email: '' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to empty name', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: '', email: 'admin@foo.bar', name: '' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to invalid email', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'somepassword', email: 'invalidemail' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('succeeds', function (done) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
            var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'somepassword', email: 'admin@foo.bar', name: 'tester' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(201);
                expect(scope1.isDone()).to.be.ok();
                expect(scope2.isDone()).to.be.ok();
                done();
            });
        });

        it('fails the second time', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            request.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'somepassword', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(409);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });
    });

    describe('Certificates API', function () {
        var certFile, keyFile;

        before(function (done) {
            certFile = path.join(os.tmpdir(), 'host.cert');
            fs.writeFileSync(certFile, 'test certificate');

            keyFile = path.join(os.tmpdir(), 'host.key');
            fs.writeFileSync(keyFile, 'test key');

            async.series([
                setup,

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    request.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(function (done) {
            fs.unlinkSync(certFile);
            fs.unlinkSync(keyFile);

            cleanup(done);
        });

        it('cannot set certificate without token', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/certificate')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot set certificate without certificate', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/certificate')
                   .query({ access_token: token })
                   .attach('key', keyFile, 'key')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot set certificate without key', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/certificate')
                   .query({ access_token: token })
                   .attach('certificate', certFile, 'certificate')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('can set certificate', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/certificate')
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

    describe('get config', function () {
        before(function (done) {
            async.series([
                setup,

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    config._reset();

                    request.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('cannot get without token', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/config')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds without appstore', function (done) {
            request.get(SERVER_URL + '/api/v1/cloudron/config')
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.apiServerOrigin).to.eql('http://localhost:6060');
                expect(result.body.webServerOrigin).to.eql(null);
                expect(result.body.fqdn).to.eql('localhost');
                expect(result.body.isCustomDomain).to.eql(false);
                expect(result.body.progress).to.be.an('object');
                expect(result.body.update).to.be.an('object');
                expect(result.body.version).to.eql('0.5.0');
                expect(result.body.developerMode).to.be.a('boolean');
                expect(result.body.size).to.eql(null);
                expect(result.body.region).to.eql(null);
                expect(result.body.cloudronName).to.be.a('string');

                done();
            });
        });

        it('succeeds', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/localhost?token=' + config.token()).reply(200, { box: { region: 'sfo', size: 'small' }});

            request.get(SERVER_URL + '/api/v1/cloudron/config')
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.apiServerOrigin).to.eql('http://localhost:6060');
                expect(result.body.webServerOrigin).to.eql(null);
                expect(result.body.fqdn).to.eql('localhost');
                expect(result.body.isCustomDomain).to.eql(false);
                expect(result.body.progress).to.be.an('object');
                expect(result.body.update).to.be.an('object');
                expect(result.body.version).to.eql('0.5.0');
                expect(result.body.developerMode).to.be.a('boolean');
                expect(result.body.size).to.eql('small');
                expect(result.body.region).to.eql('sfo');
                expect(result.body.cloudronName).to.be.a('string');

                expect(scope.isDone()).to.be.ok();

                done();
            });
        });

    });

    describe('migrate', function () {
        before(function (done) {
            async.series([
                setup,

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    config._reset();

                    request.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails without token', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo'})
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without password', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo'})
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with missing size', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with wrong size type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 4, region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with missing region', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });


        it('fails with wrong region type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 4, password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails when in wrong state', function (done) {
            var scope1 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/migrate?token=APPSTORE_TOKEN', { size: 'small', region: 'sfo', restoreKey: 'someid' }).reply(409, {});
            var scope2 = nock(config.apiServerOrigin()).put('/api/v1/boxes/' + config.fqdn() + '/backupurl?token=APPSTORE_TOKEN', { boxVersion: '0.5.0', appId: null, appVersion: null, appBackupIds: [] }).reply(201, { id: 'someid', url: 'http://foobar', backupKey: 'somerestorekey' });

            injectShellMock();

            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);

                function checkAppstoreServerCalled() {
                    if (scope1.isDone() && scope2.isDone()) {
                        restoreShellMock();
                        return done();
                    }

                    setTimeout(checkAppstoreServerCalled, 100);
                }

                checkAppstoreServerCalled();
            });
        });


        it('succeeds', function (done) {
            var scope1 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/migrate?token=APPSTORE_TOKEN', { size: 'small', region: 'sfo', restoreKey: 'someid' }).reply(202, {});
            var scope2 = nock(config.apiServerOrigin()).put('/api/v1/boxes/' + config.fqdn() + '/backupurl?token=APPSTORE_TOKEN', { boxVersion: '0.5.0', appId: null, appVersion: null, appBackupIds: [] }).reply(201, { id: 'someid', url: 'http://foobar', backupKey: 'somerestorekey' });

            injectShellMock();

            request.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);

                function checkAppstoreServerCalled() {
                    if (scope1.isDone() && scope2.isDone()) {
                        restoreShellMock();
                        return done();
                    }

                    setTimeout(checkAppstoreServerCalled, 100);
                }

                checkAppstoreServerCalled();
            });
        });
    });

    describe('feedback', function () {
        before(function (done) {
            async.series([
                setup,

                function (callback) {
                    var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                    var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                    config._reset();

                    request.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails without token', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject', description: 'some description' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: '', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with unknown type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'foobar', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds with ticket type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(201);
                done();
            });
        });

        it('fails without description', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty subject', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: '', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty description', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject', description: '' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds with feedback type', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'feedback', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(201);
                done();
            });
        });

        it('fails without subject', function (done) {
            request.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });
    });
});


