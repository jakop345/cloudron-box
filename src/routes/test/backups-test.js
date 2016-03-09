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
    superagent = require('superagent'),
    server = require('../../server.js'),
    settings = require('../../settings.js'),
    nock = require('nock'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'admin', PASSWORD = 'Foobar?1337', EMAIL ='silly@me.com';
var token = null;

var server;
function setup(done) {
    async.series([
        server.start.bind(server),

        database._clear,

        function createAdmin(callback) {
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

                // stash token for further use
                token = result.body.token;

                callback();
            });
        },

        function addApp(callback) {
            var manifest = { version: '0.0.1', manifestVersion: 1, dockerImage: 'foo', healthCheckPath: '/', httpPort: 3, title: 'ok', addons: { } };
            appdb.add('appid', 'appStoreId', manifest, 'location', [ ] /* portBindings */, null /* accessRestriction */, 0 /* memoryLimit */, callback);
        },

        function createSettings(callback) {
            settings.setBackupConfig({ provider: 'caas', token: 'BACKUP_TOKEN', bucket: 'Bucket', prefix: 'Prefix' }, callback);
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

    describe('create', function () {
        it('fails due to mising token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/backups')
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails due to wrong token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/backups')
                   .query({ access_token: token.toUpperCase() })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            var scope = nock(config.apiServerOrigin())
                        .post('/api/v1/boxes/' + config.fqdn() + '/awscredentials?token=BACKUP_TOKEN')
                        .reply(201, { credentials: { AccessKeyId: 'accessKeyId', SecretAccessKey: 'secretAccessKey', SessionToken: 'sessionToken' } });

            superagent.post(SERVER_URL + '/api/v1/backups')
                   .query({ access_token: token })
                   .end(function (error, result) {
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
