/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var expect = require('expect.js'),
    nock = require('nock'),
    os = require('os'),
    request = require('superagent'),
    server = require('../server.js'),
    _ = require('underscore');

var EXTERNAL_SERVER_URL = 'https://localhost:4443';
var INTERNAL_SERVER_URL = 'http://localhost:2020';
var APPSERVER_URL = 'http://appserver';
var FQDN = os.hostname();

describe('Server', function () {
    this.timeout(5000);

    before(function (done) {
        var user_data = JSON.stringify({ appServerUrl: APPSERVER_URL }); // user_data is a string
        var scope = nock('http://169.254.169.254')
            .persist()
            .get('/metadata/v1.json')
            .reply(200, JSON.stringify({ user_data: user_data }), { 'Content-Type': 'application/json' });
        done();
    });

    after(function (done) {
        nock.cleanAll();
        done();
    });

    describe('external - starts and stop', function () {
        it('starts', function (done) {
            server.start('external', done);
        });

        it('stops', function (done) {
            server.stop(done);
        });
    });

    describe('internal - starts and stop', function () {
        it('starts', function (done) {
            server.start('internal', done);
        });

        it('stops', function (done) {
            server.stop(done);
        });
    });

    describe('internal', function () {
        before(function (done) {
            server.start('internal', done);
        });
        after(function (done) {
            server.stop(done);
        });

        it('does not respond to provision', function (done) {
            request.post(INTERNAL_SERVER_URL + '/api/v1/installer/provision').send({ }).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(404);
                done();
            });
        });

        it('does not respond to restore', function (done) {
            request.post(INTERNAL_SERVER_URL + '/api/v1/installer/restore').send({ }).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(404);
                done();
            });
        });

        var data = {
            token: 'sometoken',
            appServerUrl: APPSERVER_URL,
            fqdn: 'www.something.com',
            version: '0.1',
            tls: {
                key: 'key',
                cert: 'cert'
            },
            boxVersionsUrl: 'https://versions.json'
        };

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.extend({ }, data);
                delete dataCopy[key];

                request.post(INTERNAL_SERVER_URL + '/api/v1/installer/update').send(dataCopy).end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(400);
                    done();
                });
            });
        });

        it('succeeds', function (done) {
            request.post(INTERNAL_SERVER_URL + '/api/v1/installer/update').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);
                done();
            });
        });
    });

    describe('external - announce', function () {
        var failingGet = null;

        before(function (done) {
            process.env.ANNOUNCE_INTERVAL = 20;

            var scope = nock(APPSERVER_URL);
            failingGet = scope.get('/api/v1/boxes/' + FQDN + '/announce');
            failingGet.times(5).reply(502);

            server.start('external', done);
        });

        after(function (done) {
            process.env.ANNOUNCE_INTERVAL = 60000;
            // failingGet.removeInterceptor({ hostname: 'appserver' });
            server.stop(done);
        });

        it('sends announce request repeatedly', function (done) {
            setTimeout(function () {
                expect(failingGet.counter).to.be.below(6); // counter is nock internal
                done();
            }, 100);
        });
    });

    describe('external - restore', function () {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        var data = {
            token: 'sometoken',
            appServerUrl: APPSERVER_URL,
            fqdn: 'www.something.com',
            restoreUrl: 'https://restoreurl',
            version: '0.1',
            tls: {
                key: 'key',
                cert: 'cert'
            },
            boxVersionsUrl: 'https://versions.json'
        };

        before(function (done) {
            server.start('external', done);
        });

        after(function (done) {
            server.stop(done);
        });

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.extend({ }, data);
                delete dataCopy[key];

                request.post(EXTERNAL_SERVER_URL + '/api/v1/installer/restore').send(dataCopy).end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(400);
                    done();
                });
            });
        });

        it('succeeds', function (done) {
            request.post(EXTERNAL_SERVER_URL + '/api/v1/installer/restore').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);
                done();
            });
        });
    });

    describe('external - provision', function () {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        var data = {
            token: 'sometoken',
            appServerUrl: APPSERVER_URL,
            fqdn: 'www.something.com',
            version: '0.1',
            tls: {
                key: 'key',
                cert: 'cert'
            },
            boxVersionsUrl: 'https://versions.json'
        };

        before(function (done) {
            server.start('external', done);
        });

        after(function (done) {
            server.stop(done);
        });

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.extend({ }, data);
                delete dataCopy[key];

                request.post(EXTERNAL_SERVER_URL + '/api/v1/installer/provision').send(dataCopy).end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(400);
                    done();
                });
            });
        });

        it('succeeds', function (done) {
            request.post(EXTERNAL_SERVER_URL + '/api/v1/installer/provision').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);
                done();
            });
        });
    });
});

