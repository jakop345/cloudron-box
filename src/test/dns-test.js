/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    AWS = require('aws-sdk'),
    database = require('../database.js'),
    expect = require('expect.js'),
    nock = require('nock'),
    settings = require('../settings.js'),
    subdomains = require('../subdomains.js'),
    util = require('util');

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

        it('upsert multiple record succeeds', function (done) {
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
                type: 'TXT',
                name: '@',
                data: '1.2.3.4',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_1_NEW = {
                id: 3352893,
                type: 'TXT',
                name: '@',
                data: 'somethingnew',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_2 = {
                id: 3352894,
                type: 'TXT',
                name: '@',
                data: 'something',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_2_NEW = {
                id: 3352894,
                type: 'TXT',
                name: '@',
                data: 'somethingnew',
                priority: null,
                port: null,
                weight: null
            };

            var DOMAIN_RECORD_3_NEW = {
                id: 3352895,
                type: 'TXT',
                name: '@',
                data: 'thirdnewone',
                priority: null,
                port: null,
                weight: null
            };

            var req1 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .get('/v2/domains/localhost/records')
                .reply(200, { domain_records: [ DOMAIN_RECORD_0, DOMAIN_RECORD_1, DOMAIN_RECORD_2 ] });
            var req2 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .put('/v2/domains/localhost/records/' + DOMAIN_RECORD_1.id)
                .reply(200, { domain_records: DOMAIN_RECORD_1_NEW });
            var req3 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .put('/v2/domains/localhost/records/' + DOMAIN_RECORD_2.id)
                .reply(200, { domain_records: DOMAIN_RECORD_2_NEW });
            var req4 = nock(DIGITALOCEAN_ENDPOINT).filteringRequestBody(function () { return false; })
                .post('/v2/domains/localhost/records')
                .reply(201, { domain_records: DOMAIN_RECORD_2_NEW });

            subdomains.upsert('', 'TXT', [ DOMAIN_RECORD_2_NEW.data, DOMAIN_RECORD_1_NEW.data, DOMAIN_RECORD_3_NEW.data ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('unused');
                expect(req1.isDone()).to.be.ok();
                expect(req2.isDone()).to.be.ok();
                expect(req3.isDone()).to.be.ok();
                expect(req4.isDone()).to.be.ok();

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

    describe('route53', function () {
        // do not clear this with [] but .length = 0 so we don't loose the reference in mockery
        var awsAnswerQueue = [];

        var AWS_HOSTED_ZONES = {
            HostedZones: [{
                Id: '/hostedzone/Z34G16B38TNZ9L',
                Name: 'localhost.',
                CallerReference: '305AFD59-9D73-4502-B020-F4E6F889CB30',
                ResourceRecordSetCount: 2,
                ChangeInfo: {
                    Id: '/change/CKRTFJA0ANHXB',
                    Status: 'INSYNC'
                }
            }, {
                Id: '/hostedzone/Z3OFC3B6E8YTA7',
                Name: 'cloudron.us.',
                CallerReference: '0B37F2DE-21A4-E678-BA32-3FC8AF0CF635',
                Config: {},
                ResourceRecordSetCount: 2,
                ChangeInfo: {
                    Id: '/change/C2682N5HXP0BZ5',
                    Status: 'INSYNC'
                }
            }],
            IsTruncated: false,
            MaxItems: '100'
        };

        before(function (done) {
            var data = {
                provider: 'route53',
                accessKeyId: 'unused',
                secretAccessKey: 'unused'
            };

            function mockery (queue) {
                return function(options, callback) {
                    expect(options).to.be.an(Object);

                    var elem = queue.shift();
                    if (!util.isArray(elem)) throw(new Error('Mock answer required'));

                    // if no callback passed, return a req object with send();
                    if (typeof callback !== 'function') {
                        return {
                            httpRequest: { headers: {} },
                            send: function (callback) {
                                expect(callback).to.be.a(Function);
                                callback(elem[0], elem[1]);
                            }
                        };
                    } else {
                        callback(elem[0], elem[1]);
                    }
                };
            }

            function Route53Mock(cfg) {
                expect(cfg).to.eql({
                    accessKeyId: data.accessKeyId,
                    secretAccessKey: data.secretAccessKey,
                    region: 'us-east-1'
                });
            }
            Route53Mock.prototype.getHostedZone = mockery(awsAnswerQueue);
            Route53Mock.prototype.getChange = mockery(awsAnswerQueue);
            Route53Mock.prototype.changeResourceRecordSets = mockery(awsAnswerQueue);
            Route53Mock.prototype.listResourceRecordSets = mockery(awsAnswerQueue);
            Route53Mock.prototype.listHostedZones = mockery(awsAnswerQueue);

            // override route53 in AWS
            // Comment this out and replace the config with real tokens to test against AWS proper
            AWS.Route53 = Route53Mock;

            settings.setDnsConfig(data, done);
        });

        it('upsert non-existing record succeeds', function (done) {
            awsAnswerQueue.push([null, AWS_HOSTED_ZONES]);
            awsAnswerQueue.push([null, {
                ChangeInfo: {
                    Id: '/change/C2QLKQIWEI0BZF',
                    Status: 'PENDING',
                    SubmittedAt: 'Mon Aug 04 2014 17: 44: 49 GMT - 0700(PDT)'
                }
            }]);

            subdomains.upsert('test', 'A', [ '1.2.3.4' ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('/change/C2QLKQIWEI0BZF');
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });

        it('upsert existing record succeeds', function (done) {
            awsAnswerQueue.push([null, AWS_HOSTED_ZONES]);
            awsAnswerQueue.push([null, {
                ChangeInfo: {
                    Id: '/change/C2QLKQIWEI0BZF',
                    Status: 'PENDING',
                    SubmittedAt: 'Mon Aug 04 2014 17: 44: 49 GMT - 0700(PDT)'
                }
            }]);

            subdomains.upsert('test', 'A', [ '1.2.3.4' ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('/change/C2QLKQIWEI0BZF');
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });

        it('upsert multiple record succeeds', function (done) {
            awsAnswerQueue.push([null, AWS_HOSTED_ZONES]);
            awsAnswerQueue.push([null, {
                ChangeInfo: {
                    Id: '/change/C2QLKQIWEI0BZF',
                    Status: 'PENDING',
                    SubmittedAt: 'Mon Aug 04 2014 17: 44: 49 GMT - 0700(PDT)'
                }
            }]);

            subdomains.upsert('', 'TXT', [ 'first', 'second', 'third' ], function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('/change/C2QLKQIWEI0BZF');
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });

        it('get succeeds', function (done) {
            awsAnswerQueue.push([null, AWS_HOSTED_ZONES]);
            awsAnswerQueue.push([null, {
                ResourceRecordSets: [{
                    Name: 'test.localhost.',
                    Type: 'A',
                    ResourceRecords: [{
                        Value: '1.2.3.4'
                    }]
                }]
            }]);

            subdomains.get('test', 'A', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.be.an(Array);
                expect(result.length).to.eql(1);
                expect(result[0]).to.eql('1.2.3.4');
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });

        it('del succeeds', function (done) {
            awsAnswerQueue.push([null, AWS_HOSTED_ZONES]);
            awsAnswerQueue.push([null, {
                ChangeInfo: {
                    Id: '/change/C2QLKQIWEI0BZF',
                    Status: 'PENDING',
                    SubmittedAt: 'Mon Aug 04 2014 17: 44: 49 GMT - 0700(PDT)'
                }
            }]);

            subdomains.remove('test', 'A', ['1.2.3.4'], function (error) {
                expect(error).to.eql(null);
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });

        it('status succeeds for pending', function (done) {
            awsAnswerQueue.push([null, {
                ChangeInfo: {
                    Id: '/change/C2QLKQIWEI0BZF',
                    Status: 'PENDING',
                    SubmittedAt: 'Mon Aug 04 2014 17: 44: 49 GMT - 0700(PDT)'
                }
            }]);

            subdomains.status('/change/C2QLKQIWEI0BZF', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('pending');
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });

        it('status succeeds for done', function (done) {
            awsAnswerQueue.push([null, {
                ChangeInfo: {
                    Id: '/change/C2QLKQIWEI0BZF',
                    Status: 'INSYNC',
                    SubmittedAt: 'Mon Aug 04 2014 17: 44: 49 GMT - 0700(PDT)'
                }
            }]);

            subdomains.status('/change/C2QLKQIWEI0BZF', function (error, result) {
                expect(error).to.eql(null);
                expect(result).to.eql('done');
                expect(awsAnswerQueue.length).to.eql(0);

                done();
            });
        });
    });
});
