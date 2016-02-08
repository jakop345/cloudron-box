/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var database = require('../database.js'),
    expect = require('expect.js'),
    groups = require('../groups.js'),
    groupdb = require('../groupdb.js'),
    GroupError = groups.GroupError;

var GROUP_NAME = 'administrators',
    GROUP_ID = GROUP_NAME;

function setup(done) {
    // ensure data/config/mount paths
    database.initialize(function (error) {
        expect(error).to.be(null);

        database._clear(done);
    });
}

function cleanup(done) {
    database._clear(done);
}

describe('Groups', function () {
    before(setup);
    after(cleanup);

    it('cannot create group - too small', function (done) {
        groups.create('a', function (error) {
            expect(error.reason).to.be(GroupError.BAD_NAME);
            done();
        });
    });

    it('cannot create group - too big', function (done) {
        groups.create(Array(256).join('a'), function (error) {
            expect(error.reason).to.be(GroupError.BAD_NAME);
            done();
        });
    });

    it('can create valid group', function (done) {
        groups.create(GROUP_NAME, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('cannot get invalid group', function (done) {
        groups.get('sometrandom', function (error) {
            expect(error.reason).to.be(GroupError.NOT_FOUND);
            done();
        });
    });

    it('can get valid group', function (done) {
        groups.get(GROUP_ID, function (error, group) {
            expect(error).to.be(null);
            expect(group.name).to.equal(GROUP_NAME);
            done();
        });
    });

    it('cannot delete invalid group', function (done) {
        groups.remove('random', function (error) {
            expect(error.reason).to.be(GroupError.NOT_FOUND);
            done();
        });
    });

    it('can delete valid group', function (done) {
        groups.remove(GROUP_ID, function (error) {
            expect(error).to.be(null);
            done();
        });
    });
});
