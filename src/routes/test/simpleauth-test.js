/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var clientdb = require('../../clientdb.js'),
    async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    request = require('superagent'),
    server = require('../../server.js'),
    nock = require('nock'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var CLIENT = {
    id: 'someclientid',
    appId: 'someappid',
    clientSecret: 'someclientsecret',
    redirectURI: '',
    scope: 'user,profile'
};
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

        function addClient(callback) {
            clientdb.add(CLIENT.id, CLIENT.appId, CLIENT.clientSecret, CLIENT.redirectURI, CLIENT.scope, callback);
        }
    ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('SimpleAuth API', function () {
    before(setup);
    after(cleanup);

    describe('login', function () {
        it('cannot login without clientId', function (done) {
            var body = {};

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot login without username', function (done) {
            var body = {
                clientId: 'someclientid'
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot login without password', function (done) {
            var body = {
                clientId: 'someclientid',
                username: USERNAME
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('cannot login with unkown clientId', function (done) {
            var body = {
                clientId: CLIENT.id+CLIENT.id,
                username: USERNAME,
                password: PASSWORD
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot login with unkown user', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME+USERNAME,
                password: PASSWORD
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot login with empty password', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: ''
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('cannot login with wrgon password', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: PASSWORD+PASSWORD
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds', function (done) {
            var body = {
                clientId: CLIENT.id,
                username: USERNAME,
                password: PASSWORD
            };

            request.post(SERVER_URL + '/api/v1/simpleauth/login')
            .send(body)
            .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(201);
                expect(result.body.accessToken).to.be.a('string');
                expect(result.body.user).to.be.an('object');
                expect(result.body.user.id).to.be.a('string');
                expect(result.body.user.username).to.be.a('string');
                expect(result.body.user.email).to.be.a('string');
                expect(result.body.user.admin).to.be.a('boolean');
                done();
            });
        });
    });
});
