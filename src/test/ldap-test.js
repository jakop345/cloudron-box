/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

require('supererror', { splatchError: true});

var database = require('../database.js'),
    expect = require('expect.js'),
    async = require('async'),
    user = require('../user.js'),
    config = require('../config.js'),
    ldapServer = require('../ldap.js'),
    ldap = require('ldapjs');

var USER_0 = {
    username: 'foobar0',
    password: 'password0',
    email: 'foo0@bar.com'
};

var USER_1 = {
    username: 'foobar1',
    password: 'password1',
    email: 'foo1@bar.com'
};

function setup(done) {
    async.series([
        database.initialize.bind(null),
        database._clear.bind(null),
        ldapServer.start.bind(null),
        user.create.bind(null, USER_0.username, USER_0.password, USER_0.email, true, null),
        user.create.bind(null, USER_1.username, USER_1.password, USER_1.email, false, USER_0)
    ], done);
}

function cleanup(done) {
    database._clear(done);
}

describe('Ldap', function () {
    before(setup);
    after(cleanup);

    describe('bind', function () {
        it('fails for nonexisting user', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=doesnotexist,ou=users,dc=cloudron', 'password', function (error) {
                expect(error).to.be.a(ldap.NoSuchObjectError);
                done();
            });
        });

        it('fails with wrong password', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + ',ou=users,dc=cloudron', 'wrongpassword', function (error) {
                expect(error).to.be.a(ldap.InvalidCredentialsError);
                done();
            });
        });

        it('succeeds', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                expect(error).to.be(null);
                done();
            });
        });
    });
});
