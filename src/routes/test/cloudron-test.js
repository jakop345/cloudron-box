'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    locker = require('../../locker.js'),
    nock = require('nock'),
    os = require('os'),
    superagent = require('superagent'),
    server = require('../../server.js'),
    shell = require('../../shell.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'superadmin', PASSWORD = 'Foobar?1337', EMAIL ='silly@me.com';
var token = null; // authentication token

var server;
function setup(done) {
    nock.cleanAll();
    config._reset();
    config.set('version', '0.5.0');
    config.set('fqdn', 'localhost');
    server.start(done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(error).to.not.be.ok();

        config._reset();

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
            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .send({ username: '', password: 'somepassword', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to internal server error on appstore side', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(500, { message: 'this is wrong' });

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'strong#A3asdf', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(500);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to empty username', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: '', password: 'ADSFsdf$%436', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to empty password', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: '', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to empty email', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'ADSF#asd546', email: '' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to wrong displayName type', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'ADSF?#asd546', email: 'admin@foo.bar', displayName: 1234 })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('fails due to invalid email', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'ADSF#asd546', email: 'invalidemail' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                expect(scope.isDone()).to.be.ok();
                done();
            });
        });

        it('succeeds', function (done) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
            var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'ADSF#asd546', email: 'admin@foo.bar', displayName: 'tester' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(201);
                expect(scope1.isDone()).to.be.ok();
                expect(scope2.isDone()).to.be.ok();
                done();
            });
        });

        it('fails the second time', function (done) {
            var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: 'someuser', password: 'ADSF#asd546', email: 'admin@foo.bar' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(409);
                expect(scope.isDone()).to.be.ok();
                done();
            });
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

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
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
            superagent.get(SERVER_URL + '/api/v1/cloudron/config')
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds without appstore', function (done) {
            superagent.get(SERVER_URL + '/api/v1/cloudron/config')
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(result.body.apiServerOrigin).to.eql('http://localhost:6060');
                expect(result.body.webServerOrigin).to.eql(null);
                expect(result.body.fqdn).to.eql(config.fqdn());
                expect(result.body.isCustomDomain).to.eql(false);
                expect(result.body.progress).to.be.an('object');
                expect(result.body.update).to.be.an('object');
                expect(result.body.version).to.eql(config.version());
                expect(result.body.developerMode).to.be.a('boolean');
                expect(result.body.size).to.eql(null);
                expect(result.body.region).to.eql(null);
                expect(result.body.memory).to.eql(os.totalmem());
                expect(result.body.cloudronName).to.be.a('string');

                done();
            });
        });

        it('succeeds', function (done) {
            var scope = nock(config.apiServerOrigin())
                  .get('/api/v1/boxes/localhost?token=' + config.token())
                  .reply(200, { box: { region: 'sfo', size: '1gb' }, user: { }});

            superagent.get(SERVER_URL + '/api/v1/cloudron/config')
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(result.body.apiServerOrigin).to.eql('http://localhost:6060');
                expect(result.body.webServerOrigin).to.eql(null);
                expect(result.body.fqdn).to.eql(config.fqdn());
                expect(result.body.isCustomDomain).to.eql(false);
                expect(result.body.progress).to.be.an('object');
                expect(result.body.update).to.be.an('object');
                expect(result.body.version).to.eql(config.version());
                expect(result.body.developerMode).to.be.a('boolean');
                expect(result.body.size).to.eql('1gb');
                expect(result.body.region).to.eql('sfo');
                expect(result.body.memory).to.eql(os.totalmem());
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

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
                        expect(result).to.be.ok();
                        expect(scope1.isDone()).to.be.ok();
                        expect(scope2.isDone()).to.be.ok();

                        // stash token for further use
                        token = result.body.token;

                        callback();
                    });
                },

                function setupBackupConfig(callback) {
                    superagent.post(SERVER_URL + '/api/v1/settings/backup_config')
                           .send({ provider: 'caas', token: 'BACKUP_TOKEN', bucket: 'Bucket', prefix: 'Prefix' })
                           .query({ access_token: token })
                           .end(function (error, result) {
                        expect(result.statusCode).to.equal(200);

                        callback();
                    });
                }

            ], done);
        });

        after(function (done) {
            locker.unlock(locker._operation); // migrate never unlocks
            cleanup(done);
        });

        it('fails without token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo'})
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo'})
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with missing size', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with wrong size type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 4, region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with missing region', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with wrong region type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 4, password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails when in wrong state', function (done) {
            var scope2 = nock(config.apiServerOrigin())
                    .post('/api/v1/boxes/' + config.fqdn() + '/awscredentials?token=BACKUP_TOKEN')
                    .reply(201, { credentials: { AccessKeyId: 'accessKeyId', SecretAccessKey: 'secretAccessKey', SessionToken: 'sessionToken' } });

            var scope3 = nock(config.apiServerOrigin())
                    .post('/api/v1/boxes/' + config.fqdn() + '/backupDone?token=APPSTORE_TOKEN', function (body) {
                        return body.boxVersion && body.restoreKey && !body.appId && !body.appVersion && body.appBackupIds.length === 0;
                    })
                    .reply(200, { id: 'someid' });

            var scope1 = nock(config.apiServerOrigin())
                .post('/api/v1/boxes/' + config.fqdn() + '/migrate?token=APPSTORE_TOKEN', function (body) {
                    return body.size && body.region && body.restoreKey;
                }).reply(409, {});

            injectShellMock();

            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(202);

                function checkAppstoreServerCalled() {
                    if (scope1.isDone() && scope2.isDone() && scope3.isDone()) {
                        restoreShellMock();
                        return done();
                    }

                    setTimeout(checkAppstoreServerCalled, 100);
                }

                checkAppstoreServerCalled();
            });
        });

        it('succeeds', function (done) {
            var scope1 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/migrate?token=APPSTORE_TOKEN', function (body) {
                return body.size && body.region && body.restoreKey;
            }).reply(202, {});

            var scope2 = nock(config.apiServerOrigin())
                    .post('/api/v1/boxes/' + config.fqdn() + '/backupDone?token=APPSTORE_TOKEN', function (body) {
                        return body.boxVersion && body.restoreKey && !body.appId && !body.appVersion && body.appBackupIds.length === 0;
                    })
                    .reply(200, { id: 'someid' });

            var scope3 = nock(config.apiServerOrigin())
                    .post('/api/v1/boxes/' + config.fqdn() + '/awscredentials?token=BACKUP_TOKEN')
                    .reply(201, { credentials: { AccessKeyId: 'accessKeyId', SecretAccessKey: 'secretAccessKey', SessionToken: 'sessionToken' } });

            injectShellMock();

            superagent.post(SERVER_URL + '/api/v1/cloudron/migrate')
                   .send({ size: 'small', region: 'sfo', password: PASSWORD })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(202);

                function checkAppstoreServerCalled() {
                    if (scope1.isDone() && scope2.isDone() && scope3.isDone()) {
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

                    superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                           .query({ setupToken: 'somesetuptoken' })
                           .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                           .end(function (error, result) {
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
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject', description: 'some description' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: '', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with unknown type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'foobar', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds with ticket type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(201);
                done();
            });
        });

        it('succeeds with app type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'app_missing', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(201);
                done();
            });
        });

        it('fails without description', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty subject', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: '', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty description', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', subject: 'some subject', description: '' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds with feedback type', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'feedback', subject: 'some subject', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(201);
                done();
            });
        });

        it('fails without subject', function (done) {
            superagent.post(SERVER_URL + '/api/v1/cloudron/feedback')
                   .send({ type: 'ticket', description: 'some description' })
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });
    });
});
