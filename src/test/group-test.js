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
        groups.create('administrators', function (error) {
            expect(error).to.be(null);
            done();
        });
    });
});
