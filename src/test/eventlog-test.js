/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var database = require('../database.js'),
    expect = require('expect.js'),
    eventlog = require('../eventlog.js'),
    EventLogError = eventlog.EventLogError;

function setup(done) {
    // ensure data/config/mount paths
    database.initialize(function (error) {
        expect(error).to.be(null);
        done();
    });
}

function cleanup(done) {
    database._clear(done);
}

describe('Eventlog', function () {
    before(setup);
    after(cleanup);

    var eventId;

    it('add succeeds', function (done) {
        eventlog.add('some.event', { ip: '1.2.3.4' }, { appId: 'thatapp' }, function (error, result) {
            expect(error).to.be(null);
            expect(result.id).to.be.ok();

            eventId = result.id;

            done();
        });
    });

    it('get succeeds', function (done) {
        eventlog.get(eventId, function (error, result) {
            expect(error).to.be(null);
            expect(result.id).to.be(eventId);
            expect(result.action).to.be('some.event');
            expect(result.creationTime).to.be.a(Date);

            expect(result.source).to.be.eql({ ip: '1.2.3.4', userId: null, username: null });
            expect(result.data).to.be.eql({ appId: 'thatapp' });

            done();
        });
    });

    it('get of unknown id fails', function (done) {
        eventlog.get('notfoundid', function (error, result) {
            expect(error).to.be.a(EventLogError);
            expect(error.reason).to.be(EventLogError.NOT_FOUND);
            expect(result).to.not.be.ok();

            done();
        });
    });

    it('getAllPaged succeeds', function (done) {
        eventlog.getAllPaged(1, 1, function (error, results) {
            expect(error).to.be(null);
            expect(results).to.be.an(Array);
            expect(results.length).to.be(1);

            expect(results[0].id).to.be(eventId);
            expect(results[0].action).to.be('some.event');
            expect(results[0].source).to.be.eql({ ip: '1.2.3.4', userId: null, username: null });
            expect(results[0].data).to.be.eql({ appId: 'thatapp' });

            done();
        });
    });
});
