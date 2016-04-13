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
    groups = require('../../groups.js'),
    superagent = require('superagent'),
    server = require('../../server.js'),
    settings = require('../../settings.js'),
    tokendb = require('../../tokendb.js'),
    nock = require('nock'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'superadmin', PASSWORD = 'Foobar?1337', EMAIL ='silly@me.com';
var USERNAME_1 = 'user', PASSWORD_1 = 'Foobar?1337', EMAIL_1 ='happy@me.com';
var token, token_1 = null;
var userId, userId_1 = null;

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

                superagent.get(SERVER_URL + '/api/v1/profile')
                      .query({ access_token: token })
                      .end(function (error, result) {
                    expect(result).to.be.ok();
                    expect(result.statusCode).to.eql(200);

                    userId = result.body.id;

                    callback();
                });
            });
        },
        function (callback) {
            superagent.post(SERVER_URL + '/api/v1/users')
                   .query({ access_token: token })
                   .send({ username: USERNAME_1, email: EMAIL_1, invite: false })
                   .end(function (error, result) {
                expect(result).to.be.ok();
                expect(result.statusCode).to.eql(201);

                token_1 = tokendb.generateToken();
                userId_1 = result.body.id;

                // HACK to get a token for second user (passwords are generated and the user should have gotten a password setup link...)
                tokendb.add(token_1, userId_1, 'test-client-id',  Date.now() + 100000, '*', callback);
            });
        }
  ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('Groups API', function () {
    before(setup);
    after(cleanup);

    describe('list', function () {
        it('cannot get groups without token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/groups')
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot get groups as normal user', function (done) {
            superagent.get(SERVER_URL + '/api/v1/groups')
                   .query({ access_token: token_1 })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('can get groups', function (done) {
            superagent.get(SERVER_URL + '/api/v1/groups')
                   .query({ access_token: token })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.groups).to.be.an(Array);
                expect(res.body.groups.length).to.be(1);
                expect(res.body.groups[0].name).to.eql('admin');
                done();
            });
        });
    });

    describe('create', function () {
        it('fails due to mising token', function (done) {
            superagent.post(SERVER_URL + '/api/v1/groups')
                  .send({ name: 'externals'})
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/groups')
                  .query({ access_token: token })
                  .send({ name: 'externals'})
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(201);
                done();
            });
        });

        it('fails for already exists', function (done) {
            superagent.post(SERVER_URL + '/api/v1/groups')
                  .query({ access_token: token })
                  .send({ name: 'externals'})
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(409);
                done();
            });
        });
    });

    describe('get', function () {
        it('cannot get non-existing group', function (done) {
            superagent.get(SERVER_URL + '/api/v1/groups/nope')
                  .query({ access_token: token })
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(404);
                done();
            });
        });

        it('cannot get existing group with normal user', function (done) {
            superagent.get(SERVER_URL + '/api/v1/groups/admin')
                  .query({ access_token: token_1 })
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(403);
                done();
            });
        });

        it('can get existing group', function (done) {
            superagent.get(SERVER_URL + '/api/v1/groups/admin')
                  .query({ access_token: token })
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(result.body.name).to.be('admin');
                expect(result.body.userIds.length).to.be(1);
                expect(result.body.userIds[0]).to.be(userId);
                done();
            });
        });
    });

    describe('remove', function () {
        it('cannot remove without token', function (done) {
            superagent.del(SERVER_URL + '/api/v1/groups/externals')
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('can remove empty group', function (done) {
            superagent.del(SERVER_URL + '/api/v1/groups/externals')
                  .send({ password: PASSWORD })
                  .query({ access_token: token })
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(204);
                done();
            });
        });

        it('cannot remove non-empty group', function (done) {
            superagent.del(SERVER_URL + '/api/v1/groups/admin')
                  .send({ password: PASSWORD })
                  .query({ access_token: token })
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(409);
                done();
            });
        });
    });

    describe('Set groups', function () {
        before(function (done) {
            async.series([
                groups.create.bind(null, 'group0'),
                groups.create.bind(null, 'group1')
            ], done);
        });

        it('cannot add user to invalid group', function (done) {
            superagent.put(SERVER_URL + '/api/v1/users/' + userId + '/set_groups')
                  .query({ access_token: token })
                  .send({ groupIds: [ 'admin', 'something' ]})
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(404);
                done();
            });
        });

        it('can add user to valid group', function (done) {
            superagent.put(SERVER_URL + '/api/v1/users/' + userId + '/set_groups')
                  .query({ access_token: token })
                  .send({ groupIds: [ 'admin', 'group0', 'group1' ]})
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(204);
                done();
            });
        });

        it('can remove last user from admin', function (done) {
            superagent.put(SERVER_URL + '/api/v1/users/' + userId + '/set_groups')
                  .query({ access_token: token })
                  .send({ groupIds: [ 'group0', 'group1' ]})
                  .end(function (error, result) {
                expect(result.statusCode).to.equal(403); // not allowed
                done();
            });
        });
    });
});
