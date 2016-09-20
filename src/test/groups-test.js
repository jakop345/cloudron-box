/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    constants = require('../constants.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    groups = require('../groups.js'),
    GroupError = groups.GroupError,
    hat = require('hat'),
    userdb = require('../userdb.js');

var GROUP0_NAME = 'administrators',
    GROUP0_ID = GROUP0_NAME;

var GROUP1_NAME = 'externs',
    GROUP1_ID = GROUP1_NAME;

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
    displayName: '',
    showTutorial: false
};

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
            expect(error.reason).to.be(GroupError.BAD_FIELD);
            done();
        });
    });

    it('cannot create group - too big', function (done) {
        groups.create(new Array(256).join('a'), function (error) {
            expect(error.reason).to.be(GroupError.BAD_FIELD);
            done();
        });
    });

    it('cannot create group - bad name', function (done) {
        groups.create('bad:name', function (error) {
            expect(error.reason).to.be(GroupError.BAD_FIELD);
            done();
        });
    });

    it('cannot create group - reserved', function (done) {
        groups.create('users', function (error) {
            expect(error.reason).to.be(GroupError.BAD_FIELD);
            done();
        });
    });

    it('can create valid group', function (done) {
        groups.create(GROUP0_NAME, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('cannot add existing group', function (done) {
        groups.create(GROUP0_NAME, function (error) {
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
        groups.get(GROUP0_ID, function (error, group) {
            expect(error).to.be(null);
            expect(group.name).to.equal(GROUP0_NAME);
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
        groups.remove(GROUP0_ID, function (error) {
            expect(error).to.be(null);
            done();
        });
    });
});

describe('Group membership', function () {
    before(function (done) {
        async.series([
            setup,
            groups.create.bind(null, GROUP0_NAME),
            userdb.add.bind(null, USER_0.id, USER_0)
        ], done);
    });
    after(cleanup);

    it('cannot add non-existent user', function (done) {
        groups.addMember(GROUP0_ID, 'randomuser', function (error) {
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
        groups.isMember(GROUP0_ID, USER_0.id, function (error, member) {
            expect(error).to.be(null);
            expect(member).to.be(false);
            done();
        });
    });

    it('can add member', function (done) {
        groups.addMember(GROUP0_ID, USER_0.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('isMember returns true', function (done) {
        groups.isMember(GROUP0_ID, USER_0.id, function (error, member) {
            expect(error).to.be(null);
            expect(member).to.be(true);
            done();
        });
    });

    it('can get members', function (done) {
        groups.getMembers(GROUP0_ID, function (error, result) {
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
        groups.removeMember(GROUP0_ID, 'randomuser', function (error) {
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

    it('can remove member', function (done) {
        groups.removeMember(GROUP0_ID, USER_0.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('has no members', function (done) {
        groups.getMembers(GROUP0_ID, function (error, result) {
            expect(error).to.be(null);
            expect(result.length).to.be(0);
            done();
        });
    });

    it('can remove group with no members', function (done) {
        groups.remove(GROUP0_ID, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('can remove group with member', function (done) {
        groups.create(GROUP0_NAME, function (error) {
            expect(error).to.eql(null);

            groups.addMember(GROUP0_ID, USER_0.id, function (error) {
                expect(error).to.be(null);

                groups.remove(GROUP0_ID, function (error) {
                    expect(error).to.eql(null);
                    done();
                });
            });
        });
    });
});

describe('Set user groups', function () {
    before(function (done) {
        async.series([
            setup,
            groups.create.bind(null, GROUP0_NAME),
            groups.create.bind(null, GROUP1_NAME),
            userdb.add.bind(null, USER_0.id, USER_0)
        ], done);
    });
    after(cleanup);

    it('can set user to single group', function (done) {
        groups.setGroups(USER_0.id, [ GROUP0_ID ], function (error) {
            expect(error).to.be(null);

            groups.getGroups(USER_0.id, function (error, groupIds) {
                expect(error).to.be(null);
                expect(groupIds.length).to.be(1);
                expect(groupIds[0]).to.be(GROUP0_ID);
                done();
            });
        });
    });

    it('can set user to multiple groups', function (done) {
        groups.setGroups(USER_0.id, [ GROUP0_ID, GROUP1_ID ], function (error) {
            expect(error).to.be(null);

            groups.getGroups(USER_0.id, function (error, groupIds) {
                expect(error).to.be(null);
                expect(groupIds.length).to.be(2);
                expect(groupIds[0]).to.be(GROUP0_ID);
                expect(groupIds[1]).to.be(GROUP1_ID);
                done();
            });
        });
    });
});

describe('Admin group', function () {
    before(function (done) {
        async.series([
            setup,
            userdb.add.bind(null, USER_0.id, USER_0)
        ], done);
    });
    after(cleanup);

    it('cannot delete admin group ever', function (done) {
        groups.remove(constants.ADMIN_GROUP_ID, function (error) {
            expect(error.reason).to.equal(GroupError.NOT_ALLOWED);

            done();
        });
    });
});
