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
    nock = require('nock'),
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

describe('OAuth Clients API', function () {
    describe('add', function () {
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
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .send({ appId: 'someApp', redirectURI: 'http://foobar.com' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('fails if not in developerMode', function (done) {
            config.set('developerMode', false);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ appId: 'someApp', redirectURI: 'http://foobar.com' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(412);
                done();
            });
        });

        it('fails without appId', function (done) {
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ redirectURI: 'http://foobar.com' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty appId', function (done) {
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ appId: '', redirectURI: 'http://foobar.com' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails without callbackURI', function (done) {
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ appId: 'someApp' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails with empty callbackURI', function (done) {
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ appId: 'someApp', redirectURI: '' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        xit('fails with malformed callbackURI', function (done) {
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ appId: 'someApp', redirectURI: 'foobar' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('succeeds', function (done) {
            config.set('developerMode', true);

            request.post(SERVER_URL + '/api/v1/oauth/clients')
                   .query({ access_token: token })
                   .send({ appId: 'someApp', redirectURI: 'http://foobar.com' })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(201);
                done();
            });
        });
    });
});
