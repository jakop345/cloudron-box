/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var appdb = require('../appdb.js'),
    assert = require('assert'),
    async = require('async'),
    database = require('../database.js'),
    config = require('../config.js'),
    EventEmitter = require('events').EventEmitter,
    expect = require('expect.js'),
    http = require('http'),
    ldapServer = require('../ldap.js'),
    ldap = require('ldapjs'),
    user = require('../user.js');

// owner
var USER_0 = {
    username: 'userName0',
    password: 'Username0pass?1234',
    email: 'user0@EMAIL.com',
    displayName: 'User 0'
};

// normal user
var USER_1 = {
    username: 'Username1',
    password: 'Username1pass?12345',
    email: 'USER1@email.com',
    displayName: 'User 1'
};

var AUDIT_SOURCE = {
    ip: '1.2.3.4'
};

var APP_0 = {
    id: 'appid-0',
    appStoreId: 'appStoreId-0',
    dnsRecordId: null,
    installationState: appdb.ISTATE_INSTALLED,
    installationProgress: null,
    runState: appdb.RSTATE_RUNNING,
    location: 'some-location-0',
    manifest: { version: '0.1', dockerImage: 'docker/app0', healthCheckPath: '/', httpPort: 80, title: 'app0' },
    httpPort: null,
    containerId: 'someContainerId',
    portBindings: { port: 5678 },
    health: null,
    accessRestriction: null,
    lastBackupId: null,
    oldConfig: null,
    memoryLimit: 4294967296
};

var dockerProxy;

function startDockerProxy(interceptor, callback) {
    assert.strictEqual(typeof interceptor, 'function');
    assert.strictEqual(typeof callback, 'function');

    return http.createServer(interceptor).listen(5687, callback);
}

function setup(done) {
    async.series([
        database.initialize.bind(null),
        database._clear.bind(null),
        ldapServer.start.bind(null),
        appdb.add.bind(null, APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0),
        appdb.update.bind(null, APP_0.id, { containerId: APP_0.containerId }),
        function (callback) {
            user.createOwner(USER_0.username, USER_0.password, USER_0.email, USER_0.displayName, AUDIT_SOURCE, function (error, result) {
                if (error) return callback(error);

                USER_0.id = result.id;

                callback(null);
            });
        },
        function (callback) {
            user.create(USER_1.username, USER_1.password, USER_1.email, USER_0.displayName, AUDIT_SOURCE, { invitor: USER_0 }, function (error, result) {
                if (error) return callback(error);

                USER_1.id = result.id;

                callback(null);
            });
        }
    ], function (error) {
        if (error) return done(error);

        dockerProxy = startDockerProxy(function interceptor(req, res) {
            var answer = {};
            var status = 500;

            if (req.method === 'GET' && req.url === '/networks') {
                answer = [{
                    Name: "irrelevant"
                }, {
                    Name: "cloudron",
                    Id: "f2de39df4171b0dc801e8002d1d999b77256983dfc63041c0f34030aa3977566",
                    Scope: "local",
                    Driver: "bridge",
                    IPAM: {
                        Driver: "default",
                        Config: [{
                            Subnet: "172.18.0.0/16"
                        }]
                    },
                    "Containers": {
                        someOtherContainerId: {
                            "EndpointID": "ed2419a97c1d9954d05b46e462e7002ea552f216e9b136b80a7db8d98b442eda",
                            "MacAddress": "02:42:ac:11:00:02",
                            "IPv4Address": "127.0.0.2/16",
                            "IPv6Address": ""
                        },
                        someContainerId: {
                            "EndpointID": "ed2419a97c1d9954d05b46e462e7002ea552f216e9b136b80a7db8d98b442eda",
                            "MacAddress": "02:42:ac:11:00:02",
                            "IPv4Address": "127.0.0.1/16",
                            "IPv6Address": ""
                        }
                    }
                }];
                status = 200;
            }

            res.writeHead(status);
            res.write(JSON.stringify(answer));
            res.end();
        }, done);
    });
}

function cleanup(done) {
    async.series([
        ldapServer.stop,
        database._clear
    ], function () {
        dockerProxy.close(function () { done(); }); // some strange error
    });
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

            client.bind('cn=' + USER_0.id + ',ou=users,dc=cloudron', 'wrongpassword', function (error) {
                expect(error).to.be.a(ldap.InvalidCredentialsError);
                done();
            });
        });

        it('succeeds without accessRestriction', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.id + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('succeeds with username and without accessRestriction', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('succeeds with email and without accessRestriction', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.email + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('fails with username for mail attribute and without accessRestriction', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('mail=' + USER_0.username + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                expect(error).to.be.a(ldap.NoSuchObjectError);
                done();
            });
        });

        it('fails with accessRestriction denied', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            appdb.update(APP_0.id, { accessRestriction: { users: [ USER_1.id ], groups: [] }}, function (error) {
                expect(error).to.eql(null);

                client.bind('cn=' + USER_0.id + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                    expect(error).to.be.a(ldap.NoSuchObjectError);
                    done();
                });
            });
        });

        it('succeeds with accessRestriction allowed', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            appdb.update(APP_0.id, { accessRestriction: { users: [ USER_1.id, USER_0.id ], groups: [] }}, function (error) {
                expect(error).to.eql(null);

                client.bind('cn=' + USER_0.id + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                    expect(error).to.be(null);
                    done();
                });
            });
        });
    });

    describe('search users', function () {
        it ('fails for non existing tree', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: '(&(l=Seattle)(email=*@email.com))'
            };

            client.search('o=example', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                result.on('error', function (error) {
                    expect(error).to.be.a(ldap.NoSuchObjectError);
                    done();
                });
                result.on('end', function (result) {
                    done(new Error('Should not succeed. Status ' + result.status));
                });
            });
        });

        it ('succeeds with basic filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: 'objectcategory=person'
            };

            client.search('ou=users,dc=cloudron', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                var entries = [];

                result.on('searchEntry', function (entry) { entries.push(entry.object); });
                result.on('error', done);
                result.on('end', function (result) {
                    expect(result.status).to.equal(0);
                    expect(entries.length).to.equal(2);
                    entries.sort(function (a, b) { return a.username > b.username; });
                    expect(entries[0].username).to.equal(USER_0.username.toLowerCase());
                    expect(entries[1].username).to.equal(USER_1.username.toLowerCase());
                    done();
                });
            });
        });

        it ('succeeds with username wildcard filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: '&(objectcategory=person)(username=username*)'
            };

            client.search('ou=users,dc=cloudron', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                var entries = [];

                result.on('searchEntry', function (entry) { entries.push(entry.object); });
                result.on('error', done);
                result.on('end', function (result) {
                    expect(result.status).to.equal(0);
                    expect(entries.length).to.equal(2);
                    entries.sort(function (a, b) { return a.username > b.username; });
                    expect(entries[0].username).to.equal(USER_0.username.toLowerCase());
                    expect(entries[1].username).to.equal(USER_1.username.toLowerCase());
                    done();
                });
            });
        });

        it ('succeeds with username filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: '&(objectcategory=person)(username=' + USER_0.username + ')'
            };

            client.search('ou=users,dc=cloudron', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                var entries = [];

                result.on('searchEntry', function (entry) { entries.push(entry.object); });
                result.on('error', done);
                result.on('end', function (result) {
                    expect(result.status).to.equal(0);
                    expect(entries.length).to.equal(1);
                    expect(entries[0].username).to.equal(USER_0.username.toLowerCase());
                    expect(entries[0].memberof.length).to.equal(2);
                    done();
                });
            });
        });
    });

    describe('search groups', function () {
        it ('succeeds with basic filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: 'objectclass=group'
            };

            client.search('ou=groups,dc=cloudron', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                var entries = [];

                result.on('searchEntry', function (entry) { entries.push(entry.object); });
                result.on('error', done);
                result.on('end', function (result) {
                    expect(result.status).to.equal(0);
                    expect(entries.length).to.equal(2);

                    // ensure order for testability
                    entries.sort(function (a, b) { return a.username < b.username; });

                    expect(entries[0].cn).to.equal('users');
                    expect(entries[0].memberuid.length).to.equal(2);
                    expect(entries[0].memberuid[0]).to.equal(USER_0.id);
                    expect(entries[0].memberuid[1]).to.equal(USER_1.id);
                    expect(entries[1].cn).to.equal('admins');
                    // if only one entry, the array becomes a string :-/
                    expect(entries[1].memberuid).to.equal(USER_0.id);
                    done();
                });
            });
        });

        it ('succeeds with cn wildcard filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: '&(objectclass=group)(cn=*)'
            };

            client.search('ou=groups,dc=cloudron', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                var entries = [];

                result.on('searchEntry', function (entry) { entries.push(entry.object); });
                result.on('error', done);
                result.on('end', function (result) {
                    expect(result.status).to.equal(0);
                    expect(entries.length).to.equal(2);
                    expect(entries[0].cn).to.equal('users');
                    expect(entries[0].memberuid.length).to.equal(2);
                    expect(entries[0].memberuid[0]).to.equal(USER_0.id);
                    expect(entries[0].memberuid[1]).to.equal(USER_1.id);
                    expect(entries[1].cn).to.equal('admins');
                    // if only one entry, the array becomes a string :-/
                    expect(entries[1].memberuid).to.equal(USER_0.id);
                    done();
                });
            });
        });

        it('succeeds with memberuid filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: '&(objectclass=group)(memberuid=' + USER_1.id + ')'
            };

            client.search('ou=groups,dc=cloudron', opts, function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an(EventEmitter);

                var entries = [];

                result.on('searchEntry', function (entry) { entries.push(entry.object); });
                result.on('error', done);
                result.on('end', function (result) {
                    expect(result.status).to.equal(0);
                    expect(entries.length).to.equal(1);
                    expect(entries[0].cn).to.equal('users');
                    expect(entries[0].memberuid.length).to.equal(2);
                    done();
                });
            });
        });
    });

    function ldapSearch(dn, filter, callback) {
        var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

        var opts = {
            filter: filter
        };

        client.search(dn, opts, function (error, result) {
            expect(error).to.be(null);
            expect(result).to.be.an(EventEmitter);

            var entries = [];

            result.on('searchEntry', function (entry) { entries.push(entry.object); });
            result.on('error', callback);
            result.on('end', function (result) {
                expect(result.status).to.equal(0);
                callback(null, entries);
            });
        });
    }

    describe('search mailbox', function () {
        it('get specific mailbox', function (done) {
            ldapSearch('cn=' + USER_0.username + ',ou=mailboxes,dc=cloudron', 'objectclass=mailbox', function (error, entries) {
                if (error) return done(error);
                expect(entries.length).to.equal(1);
                expect(entries[0].cn).to.equal(USER_0.username.toLowerCase());
                done();
            });
        });

        it('get specific mailbox by email', function (done) {
            ldapSearch('cn=' + USER_0.username + '@' + config.fqdn() + ',ou=mailboxes,dc=cloudron', 'objectclass=mailbox', function (error, entries) {
                if (error) return done(error);
                expect(entries.length).to.equal(1);
                expect(entries[0].cn).to.equal(USER_0.username.toLowerCase());
                done();
            });
        });

        it('non-existent mailbox', function (done) {
            ldapSearch('cn=random,ou=mailboxes,dc=cloudron', 'objectclass=mailbox', function (error) {
                expect(error).to.be.a(ldap.NoSuchObjectError);
                done();
            });
        });
    });

    describe('search aliases', function () {
        before(function (done) {
            user.setAliases(USER_0.id, [ 'Asterix', 'obelix' ], done);
        });

        it('get specific alias', function (done) {
            ldapSearch('cn=asterix,ou=mailaliases,dc=cloudron', 'objectclass=nismailalias', function (error, entries) {
                if (error) return done(error);
                expect(entries.length).to.equal(1);
                expect(entries[0].cn).to.equal('asterix');
                expect(entries[0].rfc822MailMember).to.equal(USER_0.username.toLowerCase());
                done();
            });
        });

        it('non-existent alias', function (done) {
            ldapSearch('cn=random,ou=mailaliases,dc=cloudron', 'objectclass=mailbox', function (error) {
                expect(error).to.be.a(ldap.NoSuchObjectError);
                done();
            });
        });
    });

    describe('bind mailbox', function () {
        it('does not allow with invalid password', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + ',ou=mailboxes,dc=cloudron', USER_0.password + 'nope', function (error) {
                expect(error).to.be.a(ldap.InvalidCredentialsError);
                done();
            });
        });

        it('allows with valid password', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + ',ou=mailboxes,dc=cloudron', USER_0.password, function (error) {
                done(error);
            });
        });

        it('allows with valid email', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + '@' + config.fqdn() + ',ou=mailboxes,dc=cloudron', USER_0.password, function (error) {
                done(error);
            });
        });
    });
});
