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
            subdomains.upsert('test', 'A', ['1.2.3.4'], function (error, result) {
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
            subdomains.remove('test', 'A', ['1.2.3.4'], function (error) {
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
});
