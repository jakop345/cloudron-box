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

var SERVER_URL = 'https://localhost:4443';
var APPSERVER_URL = 'http://localhost';
var FQDN = os.hostname();

describe('Server', function () {
    this.timeout(5000);

    describe('starts and stop', function () {
        it('starts', function (done) {
            server.start('http://fakeappserver', done);
        });

        it('stops', function (done) {
            server.stop(done);
        });
    });

    describe('announce', function () {
        var failingGet;

        before(function (done) {
            process.env.ANNOUNCE_INTERVAL = 20;

            var scope = nock(APPSERVER_URL);
            failingGet = scope.get('/api/v1/boxes/' + FQDN + '/announce');
            failingGet.times(5).reply(502);

            server.start(APPSERVER_URL, done);
        });

        after(function (done) {
            process.env.ANNOUNCE_INTERVAL = 60000;
            server.stop(done);
            nock.cleanAll();
        });

        it('sends announce request repeatedly', function (done) {
            setTimeout(function () {
                expect(failingGet.counter).to.be.below(6); // counter is nock internal
                done();
            }, 100);
        });
    });

    describe('restore', function () {
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
            }
        };

        before(function (done) {
            server.start(APPSERVER_URL, done);
        });

        after(function (done) {
            server.stop(done);
        });

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.extend({ }, data);
                delete dataCopy[key];

                request.post(SERVER_URL + '/api/v1/restore').send(dataCopy).end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(400);
                    done();
                });
            });
        });
    });

    describe('provision', function () {
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
            server.start(APPSERVER_URL, done);
        });

        after(function (done) {
            server.stop(done);
        });

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.extend({ }, data);
                delete dataCopy[key];

                request.post(SERVER_URL + '/api/v1/provision').send(dataCopy).end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(400);
                    done();
                });
            });
        });

        it('succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/provision').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(201);
                done();
            });
        });
    });
});

