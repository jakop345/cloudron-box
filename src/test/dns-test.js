/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    database = require('../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    settings = require('../settings.js'),
    subdomains = require('../subdomains.js');

describe('dns provider', function () {
    before(function (done) {
        async.series([
            database.initialize
        ], done);
    });

    after(function (done) {
        database._clear(done);
    });

    describe('noop', function () {
        before(function (done) {
            var data = {
                provider: 'noop'
            };

            settings.setDnsConfig(data, done);
        });

        it('upsert succeeds', function (done) {
            subdomains.upsert('test', 'A', [ '1.2.3.4' ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('noop-record-id');

                done();
            });
        });

        it('get succeeds', function (done) {
            subdomains.get('test', 'A', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.eql(0);

                done();
            });
        });

        it('del succeeds', function (done) {
            subdomains.remove('test', 'A', [ '1.2.3.4' ], function (error) {
                expect(error).to.eql(null);

                done();
            });
        });

        it('status succeeds', function (done) {
            subdomains.status('noop-record-id', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('done');

                done();
            });
        });
    });

    describe('digitalocean', function () {
        var TOKEN = 'sometoken';
        var DIGITALOCEAN_ENDPOINT = 'https://api.digitalocean.com';

        before(function (done) {
            var data = {
                provider: 'digitalocean',
                token: TOKEN
            };

            settings.setDnsConfig(data, done);
        });

        it('upsert non-existing record succeeds', function (done) {
            nock.cleanAll();

            var DOMAIN_RECORD_0 = {
                id: 3352892,
                type: 'A',
                name: '@',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var req1 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .get('/v2/domains/localhost/records')
                .reply(200, { domain_records: [] });
            var req2 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .post('/v2/domains/localhost/records')
                .reply(201, { domain_record: DOMAIN_RECORD_0 });

            subdomains.upsert('test', 'A', [ '1.2.3.4' ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('unused');
                expect(req1.isDone()).to.be.ok();
                expect(req2.isDone()).to.be.ok();

                done();
            });
        });

        it('upsert existing record succeeds', function (done) {
            nock.cleanAll();

            var DOMAIN_RECORD_0 = {
                id: 3352892,
                type: 'A',
                name: '@',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_1 = {
                id: 3352893,
                type: 'A',
                name: 'test',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_1_NEW = {
                id: 3352893,
                type: 'A',
                name: 'test',
                data: '1.2.3.5',
                priority: null,
                port: null,
                weight: null
            };

            var req1 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .get('/v2/domains/localhost/records')
                .reply(200, { domain_records: [ DOMAIN_RECORD_0, DOMAIN_RECORD_1 ] });
            var req2 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .put('/v2/domains/localhost/records/' + DOMAIN_RECORD_1.id)
                .reply(200, { domain_records: DOMAIN_RECORD_1_NEW });

            subdomains.upsert('test', 'A', [ DOMAIN_RECORD_1_NEW.data ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('unused');
                expect(req1.isDone()).to.be.ok();
                expect(req2.isDone()).to.be.ok();

                done();
            });
        });

        // FIXME not supported https://git.cloudron.io/cloudron/box/issues/99
        xit('upsert multiple record succeeds', function (done) {
            nock.cleanAll();

            var DOMAIN_RECORD_0 = {
                id: 3352892,
                type: 'A',
                name: '@',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_1 = {
                id: 3352893,
                type: 'A',
                name: 'test',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_2 = {
                id: 3352893,
                type: 'TXT',
                name: '@',
                data: 'something',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_2_NEW = {
                id: 3352893,
                type: 'TXT',
                name: '@',
                data: 'somethingnew',
                priority: null,
                port: null,
                weight: null
            };

            var req1 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .get('/v2/domains/localhost/records')
                .reply(200, { domain_records: [ DOMAIN_RECORD_0, DOMAIN_RECORD_1, DOMAIN_RECORD_2 ] });
            var req2 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .put('/v2/domains/localhost/records/' + DOMAIN_RECORD_2.id)
                .reply(200, { domain_records: DOMAIN_RECORD_2_NEW });
            var req3 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .post('/v2/domains/localhost/records')
                .reply(201, { domain_records: DOMAIN_RECORD_2_NEW });

            subdomains.upsert('', 'TXT', [ DOMAIN_RECORD_2_NEW.data, 'anothervalue' ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('unused');
                expect(req1.isDone()).to.be.ok();
                expect(req2.isDone()).to.be.ok();
                expect(req3.isDone()).to.be.ok();

                done();
            });
        });

        it('get succeeds', function (done) {
            nock.cleanAll();

            var DOMAIN_RECORD_0 = {
                id: 3352892,
                type: 'A',
                name: '@',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_1 = {
                id: 3352893,
                type: 'A',
                name: 'test',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var req1 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .get('/v2/domains/localhost/records')
                .reply(200, { domain_records: [ DOMAIN_RECORD_0, DOMAIN_RECORD_1 ] });

            subdomains.get('test', 'A', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.eql(1);
                expect(result[0]).to.eql(DOMAIN_RECORD_1.data);
                expect(req1.isDone()).to.be.ok();

                done();
            });
        });

        it('del succeeds', function (done) {
            nock.cleanAll();

            var DOMAIN_RECORD_0 = {
                id: 3352892,
                type: 'A',
                name: '@',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_1 = {
                id: 3352893,
                type: 'A',
                name: 'test',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var req1 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .get('/v2/domains/localhost/records')
                .reply(200, { domain_records: [ DOMAIN_RECORD_0, DOMAIN_RECORD_1 ] });
            var req2 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .delete('/v2/domains/localhost/records/' + DOMAIN_RECORD_1.id)
                .reply(204, {});

            subdomains.remove('test', 'A', ['1.2.3.4'], function (error) {
                expect(error).to.eql(null);
                expect(req1.isDone()).to.be.ok();
                expect(req2.isDone()).to.be.ok();

                done();
            });
        });

        it('status succeeds', function (done) {
            // actually not implemented in the backend
            subdomains.status('unused', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('done');

                done();
            });
        });
    });
});
