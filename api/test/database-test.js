'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var db = require('../database.js'),
    DatabaseError = db.DatabaseError,
    os = require('os'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    assert = require('assert'),
    crypto = require('crypto'),
    expect = require('expect.js');

var USER_0 = {
    username: 'girish',
    email: 'mail@g.irish',
    password: 'hsirig'
};

var USER_1 = {
    username: 'johannes',
    email: 'mail@j.ohannes',
    password: 'sennahoj'
};

var tmpdirname = 'volume-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.resolve(os.tmpdir(), tmpdirname);
var config = {
    port: 3000,
    dataRoot: path.resolve(tmpdir, 'data'),
    configRoot: path.resolve(tmpdir, 'config'),
    mountRoot: path.resolve(tmpdir, 'mount')
};

// ensure data/config/mount paths
function setup(done) {
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);

    done();
}

// remove all temporary folders
function cleanup(done) {
    rimraf(tmpdir, function (error) {
        done();
    });
}

describe('Database', function () {
    before(setup);
    after(cleanup);

    describe('initialize', function() {
        it('succeeds', function (done) {
            db.initialize(config);

            done();
        });

        it('creates table exports', function (done) {
            expect(db.USERS_TABLE).to.be.an(db.Table);
            expect(db.TOKENS_TABLE).to.be.an(db.Table);

            done();
        });

        it('firstTime', function (done) {
            expect(db.firstTime()).to.be.ok();
            done();
        });
    });

    describe('CRUD on USERS_TABLE', function () {
        describe('put', function () {
            it('succeeds', function (done) {
                db.USERS_TABLE.put(USER_0, function (error) {
                    expect(error).to.not.be.ok();
                    done();
                });
            });

            it('fails of duplicate', function (done) {
                db.USERS_TABLE.put(USER_0, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.ALREADY_EXISTS);
                    done();
                });
            });

            it('fails of wrong record structure', function (done) {
                db.USERS_TABLE.put({}, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.RECORD_SCHEMA);
                    done();
                });
            });
        });

        describe('get', function () {
            it('succeeds', function (done) {
                db.USERS_TABLE.get(USER_0.username, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result).to.equal(USER_0);
                    done();
                });
            });

            it('fails because of no such key', function (done) {
                db.USERS_TABLE.get('randomkey', function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of null key', function (done) {
                db.USERS_TABLE.get(null, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of undefined key', function (done) {
                db.USERS_TABLE.get(undefined, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });
        });

        describe('update', function () {
            it('succeeds', function (done) {
                var tmp = USER_0;
                tmp.email = 'something@el.se';

                db.USERS_TABLE.update(tmp, function (error) {
                    expect(error).to.not.be.ok();

                    db.USERS_TABLE.get(tmp.username, function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();
                        expect(result).to.equal(tmp);
                        done();
                    });
                });
            });

            it('fails of no such key', function (done) {
                db.USERS_TABLE.update(USER_1, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails of wrong record schema', function (done) {
                db.USERS_TABLE.update({}, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.RECORD_SCHEMA);
                    done();
                });
            });

            it('fails because of wrong arguments', function (done) {
                expect(function () {
                    db.USERS_TABLE.update(null, function () {});
                }).to.throwException();
                expect(function () {
                    db.USERS_TABLE.update(undefined, function () {});
                }).to.throwException();
                done();
            });
        });

        describe('remove', function () {
            it('succeeds', function (done) {
                db.USERS_TABLE.remove(USER_0.username, function (error) {
                    expect(error).to.not.be.ok();

                    db.USERS_TABLE.get(USER_0.username, function (error, result) {
                        expect(error).to.be.ok();
                        expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                        expect(result).to.not.be.ok();
                        done();
                    });
                });
            });

            it('fails of no such key', function (done) {
                db.USERS_TABLE.remove(USER_1, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of null key', function (done) {
                db.USERS_TABLE.remove(null, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of undefined key', function (done) {
                db.USERS_TABLE.remove(undefined, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });
        });

    });

    describe('count', function () {
        it('increment', function (done) {
            expect(db.USERS_TABLE.count()).to.equal(0);

            db.USERS_TABLE.put(USER_0, function (error) {
                expect(error).to.not.be.ok();
                expect(db.USERS_TABLE.count()).to.equal(1);

                db.USERS_TABLE.put(USER_1, function (error) {
                    expect(error).to.not.be.ok();
                    expect(db.USERS_TABLE.count()).to.equal(2);
                    done();
                });
            });
        });

        it('decrement', function (done) {
            expect(db.USERS_TABLE.count()).to.equal(2);

            db.USERS_TABLE.remove(USER_0.username, function (error) {
                expect(error).to.not.be.ok();
                expect(db.USERS_TABLE.count()).to.equal(1);

                db.USERS_TABLE.remove(USER_1.username, function (error) {
                    expect(error).to.not.be.ok();
                    expect(db.USERS_TABLE.count()).to.equal(0);
                    done();
                });
            });
        });
    });

    describe('removeAll', function () {
        it('succeeds', function (done) {
            db.USERS_TABLE.put(USER_0, function (error) {
                expect(error).to.not.be.ok();

                db.USERS_TABLE.put(USER_1, function (error) {
                    expect(error).to.not.be.ok();
                    expect(db.USERS_TABLE.count()).to.equal(2);

                    db.USERS_TABLE.removeAll(function (error) {
                        expect(error).to.not.be.ok();
                        expect(db.USERS_TABLE.count()).to.equal(0);
                        done();
                    });
                });
            });
        });
    });

    describe('remove privates', function () {
        it('succeeds', function (done) {
            var tmp = db.USERS_TABLE.removePrivates(USER_0);
            expect(tmp.password).to.not.be.ok();
            expect(tmp.username).to.be.ok();
            expect(tmp.username).to.equal(USER_0.username);
            done();
        });
    });
});
