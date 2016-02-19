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
    username: 'username0',
    password: 'Username0pass?1234',
    email: 'user0@email.com',
    displayName: 'User 0'
};

// normal user
var USER_1 = {
    username: 'username1',
    password: 'Username1pass?12345',
    email: 'user1@email.com',
    displayName: 'User 1'
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
    lastBackupConfig: null,
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
        appdb.add.bind(null, APP_0.id, APP_0.appStoreId, APP_0.manifest, APP_0.location, APP_0.portBindings, APP_0.accessRestriction, APP_0.memoryLimit),
        appdb.update.bind(null, APP_0.id, { containerId: APP_0.containerId }),
        user.createOwner.bind(null, USER_0.username, USER_0.password, USER_0.email, USER_0.displayName),
        user.create.bind(null, USER_1.username, USER_1.password, USER_1.email, USER_0.displayName, { invitor: USER_0 })
    ], function (error) {
        if (error) return done(error);

        dockerProxy = startDockerProxy(function interceptor(req, res) {
            var answer = {};
            var status = 500;

            if (req.method === 'GET' && req.url === '/networks') {
                answer = [{
                    Name: "irrelevant"
                }, {
                    Name: "bridge",
                    Id: "f2de39df4171b0dc801e8002d1d999b77256983dfc63041c0f34030aa3977566",
                    Scope: "local",
                    Driver: "bridge",
                    IPAM: {
                        Driver: "default",
                        Config: [{
                            Subnet: "172.17.0.0/16"
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

        it('succeeds without accessRestriction', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            client.bind('cn=' + USER_0.username + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('fails with accessRestriction denied', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            appdb.update(APP_0.id, { accessRestriction: { users: [ USER_1.username ], groups: [] }}, function (error) {
                expect(error).to.eql(null);

                client.bind('cn=' + USER_0.username + ',ou=users,dc=cloudron', USER_0.password, function (error) {
                    expect(error).to.be.a(ldap.NoSuchObjectError);
                    done();
                });
            });
        });

        it('succeeds with accessRestriction allowed', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            appdb.update(APP_0.id, { accessRestriction: { users: [ USER_1.username, USER_0.username ], groups: [] }}, function (error) {
                expect(error).to.eql(null);

                client.bind('cn=' + USER_0.username + ',ou=users,dc=cloudron', USER_0.password, function (error) {
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
                    expect(entries[0].username).to.equal(USER_0.username);
                    expect(entries[1].username).to.equal(USER_1.username);
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
                    expect(entries[0].username).to.equal(USER_0.username);
                    expect(entries[1].username).to.equal(USER_1.username);
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
                    expect(entries[0].username).to.equal(USER_0.username);
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
                    expect(entries[0].cn).to.equal('users');
                    expect(entries[0].memberuid.length).to.equal(2);
                    expect(entries[0].memberuid[0]).to.equal(USER_0.username);
                    expect(entries[0].memberuid[1]).to.equal(USER_1.username);
                    expect(entries[1].cn).to.equal('admins');
                    // if only one entry, the array becomes a string :-/
                    expect(entries[1].memberuid).to.equal(USER_0.username);
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
                    expect(entries[0].memberuid[0]).to.equal(USER_0.username);
                    expect(entries[0].memberuid[1]).to.equal(USER_1.username);
                    expect(entries[1].cn).to.equal('admins');
                    // if only one entry, the array becomes a string :-/
                    expect(entries[1].memberuid).to.equal(USER_0.username);
                    done();
                });
            });
        });

        it('succeeds with memberuid filter', function (done) {
            var client = ldap.createClient({ url: 'ldap://127.0.0.1:' + config.get('ldapPort') });

            var opts = {
                filter: '&(objectclass=group)(memberuid=' + USER_1.username + ')'
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
});
