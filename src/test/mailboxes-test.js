/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var database = require('../database.js'),
    expect = require('expect.js'),
    mailboxes = require('../mailboxes.js'),
    MailboxError = mailboxes.MailboxError,
    hat = require('hat');

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

var MAILBOX_ID = 'test';

describe('Mailboxes', function () {
    before(setup);
    after(cleanup);

    it('cannot create mailbox - too small', function (done) {
        mailboxes.add('a', function (error) {
            expect(error.reason).to.be(MailboxError.BAD_NAME);
            done();
        });
    });

    it('cannot create mailbox - too big', function (done) {
        mailboxes.add(new Array(129).join('a'), function (error) {
            expect(error.reason).to.be(MailboxError.BAD_NAME);
            done();
        });
    });

    it('cannot create mailbox - bad name', function (done) {
        mailboxes.add('bad:name', function (error) {
            expect(error.reason).to.be(MailboxError.BAD_NAME);
            done();
        });
    });

    it('cannot create mailbox - reserved', function (done) {
        mailboxes.add('no-reply', function (error) {
            expect(error.reason).to.be(MailboxError.BAD_NAME);
            done();
        });
    });

    it('can create valid mailbox', function (done) {
        mailboxes.add(MAILBOX_ID, function (error) {
            expect(error).to.be(null);
            done();
        });
    });

    it('cannot add existing mailbox', function (done) {
        mailboxes.add(MAILBOX_ID, function (error) {
            expect(error.reason).to.be(MailboxError.ALREADY_EXISTS);
            done();
        });
    });

    it('cannot get invalid mailbox', function (done) {
        mailboxes.get('sometrandom', function (error) {
            expect(error.reason).to.be(MailboxError.NOT_FOUND);
            done();
        });
    });

    it('can get valid mailbox', function (done) {
        mailboxes.get(MAILBOX_ID, function (error, group) {
            expect(error).to.be(null);
            expect(group.name).to.equal(MAILBOX_ID);
            done();
        });
    });

    it('cannot delete invalid mailbox', function (done) {
        mailboxes.del('random', function (error) {
            expect(error.reason).to.be(MailboxError.NOT_FOUND);
            done();
        });
    });
});

