'use strict';

/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var async = require('async'),
    config = require('../../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    nock = require('nock'),
    paths = require('../../paths.js'),
    request = require('superagent'),
    server = require('../../server.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var token = null; // authentication token

var server;
function setup(done) {
    server.start(done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(error).to.not.be.ok();

        server.stop(done);
    });
}

describe('Developer API', function () {

    describe('isEnabled', function () {
        before(function (done) {
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
                        expect(scope1.isDone());
                        expect(scope2.isDone());

                        // stash token for further use
                        token = result.body.token;

                        config.set('token', 'APPSTORE_TOKEN');

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('succeeds (not enabled)', function (done) {
            config.set('developerMode', false);

            request.get(SERVER_URL + '/api/v1/developer')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(412);
                done();
            });
        });

        it('succeeds (enabled)', function (done) {
            config.set('developerMode', true);

            request.get(SERVER_URL + '/api/v1/developer')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                done();
            });
        });
    });

    describe('login', function () {
        before(function (done) {
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
                        expect(scope1.isDone());
                        expect(scope2.isDone());

                        // stash token for further use
                        token = result.body.token;

                        config.set('token', 'APPSTORE_TOKEN');

                        callback();
                    });
                },
            ], done);
        });

        after(cleanup);

        it('fails without body', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without username', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ password: PASSWORD })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails without password', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with empty username', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: '', password: PASSWORD })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with empty password', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: '' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with unknown username', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME.toUpperCase(), password: PASSWORD })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails with wrong password', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: PASSWORD.toUpperCase() })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('with username succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: USERNAME, password: PASSWORD })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.expiresAt).to.be.a('number');
                expect(result.body.token).to.be.a('string');
                done();
            });
        });

        it('with email succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/developer/login')
                   .send({ username: EMAIL, password: PASSWORD })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.expiresAt).to.be.a('number');
                expect(result.body.token).to.be.a('string');
                done();
            });
        });
    });
});
