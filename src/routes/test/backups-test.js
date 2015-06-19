/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../../appdb.js'),
    async = require('async'),
    config = require('../../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    request = require('superagent'),
    server = require('../../server.js'),
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
            appdb.add('appid', 'appStoreId', manifest, 'location', [ ] /* portBindings */, '' /* accessRestriction */, callback);
        }
    ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('Backups API', function () {
    before(setup);
    after(cleanup);

    describe('get', function () {
        it('cannot get backups with appstore request failing', function (done) {
            var req = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/backups?token=APPSTORE_TOKEN').reply(401, {});

            request.get(SERVER_URL + '/api/v1/backups')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(500);
                expect(req.isDone()).to.be.ok();
                done(err);
            });
        });

        it('can get backups', function (done) {
            var req = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/backups?token=APPSTORE_TOKEN').reply(200, { backups: ['foo', 'bar']});

            request.get(SERVER_URL + '/api/v1/backups')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(req.isDone()).to.be.ok();
                expect(res.body.backups).to.be.an(Array);
                expect(res.body.backups[0]).to.eql('foo');
                expect(res.body.backups[1]).to.eql('bar');
                done(err);
            });
        });
    });

    describe('create', function () {
        it('fails due to mising token', function (done) {
            request.post(SERVER_URL + '/api/v1/backups')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to wrong token', function (done) {
            request.post(SERVER_URL + '/api/v1/backups')
                   .query({ access_token: token.toUpperCase() })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            var scope = nock(config.apiServerOrigin())
                        .put('/api/v1/boxes/' + config.fqdn() + '/backupurl?token=APPSTORE_TOKEN', { boxVersion: '0.5.0', appId: null, appVersion: null, appBackupIds: [null] })
                        .reply(201, { id: 'someid', url: 'http://foobar', backupKey: 'somerestorekey' });

            request.post(SERVER_URL + '/api/v1/backups')
                   .query({ access_token: token })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);

                function checkAppstoreServerCalled() {
                    if (scope.isDone()) {
                        return done();
                    }

                    setTimeout(checkAppstoreServerCalled, 100);
                }

                checkAppstoreServerCalled();
            });
        });
    });
});

