/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    constants = require('../constants.js'),
    database = require('../database.js'),
    DatabaseError = require('../databaseerror.js'),
    expect = require('expect.js'),
    groups = require('../groups.js'),
    GroupError = groups.GroupError,
    hat = require('hat'),
    mailboxdb = require('../mailboxdb.js'),
    userdb = require('../userdb.js');

var GROUP0_NAME = 'administrators',
    group0Object;

var GROUP1_NAME = 'externs',
    group1Object;

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

    it('cannot create group - invalid', function (done) {
        groups.create('cloudron-admin', function (error) {
            expect(error.reason).to.be(GroupError.BAD_FIELD);
            done();
        });
    });

    it('can create valid group', function (done) {
        groups.create(GROUP0_NAME, function (error, result) {
            expect(error).to.be(null);
            group0Object = result;
            done();
        });
    });

    it('cannot create existing group with mixed case', function (done) {
        var name = GROUP0_NAME[0].toUpperCase() + GROUP0_NAME.substr(1);
        groups.create(name, function (error, result) {
            expect(error.reason).to.be(GroupError.ALREADY_EXISTS);
            done();
        });
    });

    it('did create mailbox', function (done) {
        mailboxdb.getGroup(GROUP0_NAME.toLowerCase(), function (error, mailbox) {
            expect(error).to.be(null);
            expect(mailbox.ownerType).to.be(mailboxdb.TYPE_GROUP);
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
        groups.get(group0Object.id, function (error, group) {
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
        groups.remove(group0Object.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('did delete mailbox', function (done) {
        mailboxdb.getGroup(GROUP0_NAME.toLowerCase(), function (error) {
            expect(error.reason).to.be(DatabaseError.NOT_FOUND);
            done();
        });
    });
});

describe('Group membership', function () {
    before(function (done) {
        async.series([
            setup,
            function (next) {
                groups.create(GROUP0_NAME, function (error, result) {
                    if (error) return next(error);
                    group0Object = result;
                    next();
                });
            },
            userdb.add.bind(null, USER_0.id, USER_0)
        ], done);
    });
    after(cleanup);

    it('cannot add non-existent user', function (done) {
        groups.addMember(group0Object.id, 'randomuser', function (error) {
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
        groups.isMember(group0Object.id, USER_0.id, function (error, member) {
            expect(error).to.be(null);
            expect(member).to.be(false);
            done();
        });
    });

    it('can add member', function (done) {
        groups.addMember(group0Object.id, USER_0.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('isMember returns true', function (done) {
        groups.isMember(group0Object.id, USER_0.id, function (error, member) {
            expect(error).to.be(null);
            expect(member).to.be(true);
            done();
        });
    });

    it('can get members', function (done) {
        groups.getMembers(group0Object.id, function (error, result) {
            expect(error).to.be(null);
            expect(result.length).to.be(1);
            expect(result[0]).to.be(USER_0.id);
            done();
        });
    });

    it('can get list members', function (done) {
        mailboxdb.getGroup(GROUP0_NAME.toLowerCase(), function (error, result) {
            expect(error).to.be(null);
            expect(result.name).to.be(GROUP0_NAME.toLowerCase());
            expect(result.ownerType).to.be(mailboxdb.TYPE_GROUP);
            expect(result.ownerId).to.be(group0Object.id);
            expect(result.members).to.eql([ USER_0.username ]);
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
        groups.removeMember(group0Object.id, 'randomuser', function (error) {
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

    it('can set groups', function (done) {
        groups.setMembers(group0Object.id, [ USER_0.id ], function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('can remove member', function (done) {
        groups.removeMember(group0Object.id, USER_0.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('has no members', function (done) {
        groups.getMembers(group0Object.id, function (error, result) {
            expect(error).to.be(null);
            expect(result.length).to.be(0);
            done();
        });
    });

    it('can remove group with no members', function (done) {
        groups.remove(group0Object.id, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('can remove group with member', function (done) {
        groups.create(GROUP0_NAME, function (error, result) {
            expect(error).to.eql(null);
            group0Object = result;

            groups.addMember(group0Object.id, USER_0.id, function (error) {
                expect(error).to.be(null);

                groups.remove(group0Object.id, function (error) {
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
            function (next) {
                groups.create(GROUP0_NAME, function (error, result) {
                    if (error) return next(error);
                    group0Object = result;
                    next();
                });
            },
            function (next) {
                groups.create(GROUP1_NAME, function (error, result) {
                    if (error) return next(error);
                    group1Object = result;
                    next();
                });
            },
            userdb.add.bind(null, USER_0.id, USER_0)
        ], done);
    });
    after(cleanup);

    it('can set user to single group', function (done) {
        groups.setGroups(USER_0.id, [ group0Object.id ], function (error) {
            expect(error).to.be(null);

            groups.getGroups(USER_0.id, function (error, groupIds) {
                expect(error).to.be(null);
                expect(groupIds.length).to.be(1);
                expect(groupIds[0]).to.be(group0Object.id);
                done();
            });
        });
    });

    it('can set user to multiple groups', function (done) {
        groups.setGroups(USER_0.id, [ group0Object.id, group1Object.id ], function (error) {
            expect(error).to.be(null);

            groups.getGroups(USER_0.id, function (error, groupIds) {
                expect(error).to.be(null);
                expect(groupIds.length).to.be(2);
                expect(groupIds.sort()).to.eql([ group0Object.id, group1Object.id ].sort());
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
