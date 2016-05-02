/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    superagent = require('superagent'),
    server = require('../../server.js'),
    tokendb = require('../../tokendb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'superadmin', PASSWORD = 'Foobar?1337', EMAIL ='silly@me.com';
var token = null;

var USER_1_ID = null, token_1;

function setup(done) {
    config.setVersion('1.2.3');

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

        function (callback) {
            superagent.post(SERVER_URL + '/api/v1/users')
                   .query({ access_token: token })
                   .send({ username: 'nonadmin', email: 'notadmin@server.test', invite: false })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);

                USER_1_ID = res.body.id;

                callback(null);
            });
        },

        function (callback) {
            token_1 = tokendb.generateToken();

            // HACK to get a token for second user (passwords are generated and the user should have gotten a password setup link...)
            tokendb.add(token_1, tokendb.PREFIX_USER + USER_1_ID, 'test-client-id',  Date.now() + 100000, '*', callback);
        }

    ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('Eventlog API', function () {
    before(setup);
    after(cleanup);

    describe('get', function () {
        it('fails due to wrong token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/eventlog')
                   .query({ access_token: token.toUpperCase() })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails for non-admin', function (done) {
            superagent.get(SERVER_URL + '/api/v1/eventlog')
                   .query({ access_token: token_1, page: 1, per_page: 10 })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(403);

                done();
            });
        });

        it('succeeds for admin', function (done) {
            superagent.get(SERVER_URL + '/api/v1/eventlog')
                   .query({ access_token: token, page: 1, per_page: 10 })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(result.body.eventlogs.length >= 2).to.be.ok(); // activate, user.add

                done();
            });
        });
    });
});
