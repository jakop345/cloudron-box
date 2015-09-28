/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
    nock = require('nock'),
    os = require('os'),
    request = require('superagent'),
    server = require('../server.js'),
    _ = require('lodash');

var EXTERNAL_SERVER_URL = 'https://localhost:4443';
var INTERNAL_SERVER_URL = 'http://localhost:2020';
var APPSERVER_ORIGIN = 'http://appserver';
var FQDN = os.hostname();

describe('Server', function () {
    this.timeout(5000);

    before(function (done) {
        var user_data = JSON.stringify({ apiServerOrigin: APPSERVER_ORIGIN }); // user_data is a string
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

    describe('starts and stop', function () {
        it('starts', function (done) {
            server.start(done);
        });

        it('stops', function (done) {
            server.stop(done);
        });
    });

    describe('update (internal server)', function () {
        before(function (done) {
            server.start(done);
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
            sourceTarballUrl: "https://foo.tar.gz",

            data: {
                token: 'sometoken',
                apiServerOrigin: APPSERVER_ORIGIN,
                webServerOrigin: 'https://somethingelse.com',
                fqdn: 'www.something.com',
                tlsKey: 'key',
                tlsCert: 'cert',
                boxVersionsUrl: 'https://versions.json',
                version: '0.1'
            }
        };

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.merge({ }, data);
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

    describe('retire', function () {
        var data = {
            data: {
                tlsKey: 'key',
                tlsCert: 'cert'
            }
        };

        before(function (done) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // TODO: use a installer ca signed cert instead
            server.start(done);
        });

        after(function (done) {
            server.stop(done);
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        });

        Object.keys(data).forEach(function (key) {
            it('fails due to missing ' + key, function (done) {
                var dataCopy = _.merge({ }, data);
                delete dataCopy[key];

                request.post(EXTERNAL_SERVER_URL + '/api/v1/installer/retire').send(dataCopy).end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(400);
                    done();
                });
            });
        });

        it('succeeds', function (done) {
            request.post(EXTERNAL_SERVER_URL + '/api/v1/installer/retire').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(202);
                done();
            });
        });
    });
});

