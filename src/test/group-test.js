/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    database = require('../database.js'),
    expect = require('expect.js'),
    groups = require('../groups.js'),
    GroupError = groups.GroupError,
    hat = require('hat'),
    userdb = require('../userdb.js');

var GROUP_NAME = 'administrators',
    GROUP_ID = 'gid:' + GROUP_NAME;

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

    it('cannot create group - bad name', function (done) {
        groups.create('bad:name', function (error) {
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

    it('cannot add existing group', function (done) {
        groups.create(GROUP_NAME, function (error) {
            expect(error.reason).to.be(GroupError.ALREADY_EXISTS);
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

describe('Group membership', function () {
    var USER_0 = {
        id: 'uuid213',
        username: 'uuid213',
        password: 'secret',
        email: 'safe@me.com',
        admin: false,
        salt: 'morton',
        createdAt: 'sometime back',
        modifiedAt: 'now',
        resetToken: hat(256),
        displayName: ''
    };

    before(function (done) {
        async.series([
            setup,
            groups.create.bind(null, GROUP_NAME),
            userdb.add.bind(null, USER_0.id, USER_0)
        ], done);
    });
    after(cleanup);

    it('cannot add non-existent user', function (done) {
        groups.addMember(GROUP_ID, 'randomuser', function (error) {
            expect(error.reason).to.be(GroupError.NOT_FOUND);
            done();
        });
    });

    it('cannot add non-existent group', function (done) {
        groups.addMember('randomgroup', USER_0.id, function (error) {
            expect(error.reason).to.be(GroupError.NOT_FOUND);
            done();
        });
    });

    it('isMember returns false', function (done) {
        groups.isMember(GROUP_ID, USER_0.id, function (error, member) {
            expect(error).to.be(null);
            expect(member).to.be(false);
            done();
        });
    });

    it('can add member', function (done) {
        groups.addMember(GROUP_ID, USER_0.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('isMember returns true', function (done) {
        groups.isMember(GROUP_ID, USER_0.id, function (error, member) {
            expect(error).to.be(null);
            expect(member).to.be(true);
            done();
        });
    });

    it('can get members', function (done) {
        groups.getMembers(GROUP_ID, function (error, result) {
            expect(error).to.be(null);
            expect(result.length).to.be(1);
            expect(result[0]).to.be(USER_0.id);
            done();
        });
    });

    it('cannot get members of non-existent group', function (done) {
        groups.getMembers('randomgroup', function (error, result) {
            expect(result.length).to.be(0); // currently, we cannot differentiate invalid groups and empty groups
            done();
        });
    });

    it('cannot remove non-existent user', function (done) {
        groups.removeMember(GROUP_ID, 'randomuser', function (error) {
            expect(error.reason).to.be(GroupError.NOT_FOUND);
            done();
        });
    });

    it('cannot remove non-existent group', function (done) {
        groups.removeMember('randomgroup', USER_0.id, function (error) {
            expect(error.reason).to.be(GroupError.NOT_FOUND);
            done();
        });
    });

    it('cannot remove group with member', function (done) {
        groups.remove(GROUP_ID, function (error) {
            expect(error.reason).to.be(GroupError.NOT_EMPTY);
            done();
        });
    });

    it('can remove member', function (done) {
        groups.removeMember(GROUP_ID, USER_0.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('has no members', function (done) {
        groups.getMembers(GROUP_ID, function (error, result) {
            expect(error).to.be(null);
            expect(result.length).to.be(0);
            done();
        });
    });

    it('can remove group with no members', function (done) {
        groups.remove(GROUP_ID, function (error) {
            expect(error).to.be(null);
            done();
        });
    });
});
