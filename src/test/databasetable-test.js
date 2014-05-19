'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var DatabaseTable = require('../databasetable.js'),
    DatabaseError = require('../databaseerror.js'),
    os = require('os'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
    crypto = require('crypto'),
    expect = require('expect.js');

var USER_0 = {
    username: 'girish',
    email: 'mail@g.irish',
    _password: 'hsirig'
};

var USER_1 = {
    username: 'johannes',
    email: 'mail@j.ohannes',
    _password: 'sennahoj'
};

var tmpdirname = 'volume-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.resolve(os.tmpdir(), tmpdirname);
var configDir = path.resolve(tmpdir, 'config');

// ensure data/config/mount paths
function setup(done) {
    mkdirp.sync(configDir);
    done();
}

// remove all temporary folders
function cleanup(done) {
    rimraf(tmpdir, done);
}

describe('Database', function () {
    var db = null;

    before(setup);
    after(cleanup);

    describe('initialize', function() {
        it('succeeds', function () {
            db = new DatabaseTable(path.join(configDir, 'db/users'), {
                username: { type: 'String', hashKey: true },
                email: { type: 'String' },
                _password: { type: 'String' }
            });

            expect(db).to.be.a(DatabaseTable);
        });
    });

    describe('CRUD', function () {
        describe('put', function () {
            it('succeeds', function (done) {
                db.put(USER_0, function (error) {
                    expect(error).to.not.be.ok();
                    done();
                });
            });

            it('fails of duplicate', function (done) {
                db.put(USER_0, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.ALREADY_EXISTS);
                    done();
                });
            });

            it('fails of wrong record structure', function (done) {
                db.put({}, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.RECORD_SCHEMA);
                    done();
                });
            });
        });

        describe('get', function () {
            it('succeeds', function (done) {
                db.get(USER_0.username, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();
                    expect(result).to.equal(USER_0);
                    done();
                });
            });

            it('fails because of no such key', function (done) {
                db.get('randomkey', function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of null key', function (done) {
                db.get(null, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of undefined key', function (done) {
                db.get(undefined, function (error) {
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

                db.update(tmp, function (error) {
                    expect(error).to.not.be.ok();

                    db.get(tmp.username, function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();
                        expect(result).to.equal(tmp);
                        done();
                    });
                });
            });

            it('fails of no such key', function (done) {
                db.update(USER_1, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails of wrong record schema', function (done) {
                db.update({}, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.RECORD_SCHEMA);
                    done();
                });
            });

            it('fails because of wrong arguments', function (done) {
                expect(function () {
                    db.update(null, function () {});
                }).to.throwException();
                expect(function () {
                    db.update(undefined, function () {});
                }).to.throwException();
                done();
            });
        });

        describe('remove', function () {
            it('succeeds', function (done) {
                db.remove(USER_0.username, function (error) {
                    expect(error).to.not.be.ok();

                    db.get(USER_0.username, function (error, result) {
                        expect(error).to.be.ok();
                        expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                        expect(result).to.not.be.ok();
                        done();
                    });
                });
            });

            it('fails of no such key', function (done) {
                db.remove(USER_1, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of null key', function (done) {
                db.remove(null, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });

            it('fails because of undefined key', function (done) {
                db.remove(undefined, function (error) {
                    expect(error).to.be.ok();
                    expect(error.reason).to.equal(DatabaseError.NOT_FOUND);
                    done();
                });
            });
        });

    });

    describe('count', function () {
        it('increment', function (done) {
            expect(db.count()).to.equal(0);

            db.put(USER_0, function (error) {
                expect(error).to.not.be.ok();
                expect(db.count()).to.equal(1);

                db.put(USER_1, function (error) {
                    expect(error).to.not.be.ok();
                    expect(db.count()).to.equal(2);
                    done();
                });
            });
        });

        it('decrement', function (done) {
            expect(db.count()).to.equal(2);

            db.remove(USER_0.username, function (error) {
                expect(error).to.not.be.ok();
                expect(db.count()).to.equal(1);

                db.remove(USER_1.username, function (error) {
                    expect(error).to.not.be.ok();
                    expect(db.count()).to.equal(0);
                    done();
                });
            });
        });
    });

    describe('removeAll', function () {
        it('succeeds', function (done) {
            db.put(USER_0, function (error) {
                expect(error).to.not.be.ok();

                db.put(USER_1, function (error) {
                    expect(error).to.not.be.ok();
                    expect(db.count()).to.equal(2);

                    db.removeAll(function (error) {
                        expect(error).to.not.be.ok();
                        expect(db.count()).to.equal(0);
                        done();
                    });
                });
            });
        });
    });

    describe('getAll', function () {
        it('returns empty array', function (done) {
            db.getAll(true, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                expect(result.length).to.be(0);
                done();
            });
        });

        it('succeeds', function (done) {
            db.put(USER_0, function (error) {
                expect(error).to.not.be.ok();

                db.put(USER_1, function (error) {
                    expect(error).to.not.be.ok();

                    db.getAll(true, function (error, result) {
                        expect(error).to.not.be.ok();
                        expect(result).to.be.ok();

                        expect(result.length).to.be(2);
                        expect(result[0]).to.be.an('object');
                        expect(result[0].username).to.be.equal(USER_0.username);

                        db.removeAll(function (error) {
                            expect(error).to.not.be.ok();
                            expect(db.count()).to.equal(0);
                            done();
                        });
                    });
                });
            });
        });

        it('returns a copy of its internal cache', function (done) {
            db.put(USER_0, function (error) {
                expect(error).to.not.be.ok();

                db.getAll(true, function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result).to.be.ok();

                    // using internal .cache!!!!
                    expect(result[0]).to.not.equal(db.cache[0]);

                    done();
                });
            });
        });

        it('does purge private fields', function (done) {
            db.getAll(false, function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                expect(result[0].username).to.be.equal(USER_0.username);

                done();
            });
        });
    });

    describe('remove privates', function () {
        it('succeeds', function (done) {
            var tmp = db.removePrivates(USER_0);
            expect(tmp._password).to.not.be.ok();
            expect(tmp.username).to.be.ok();
            expect(tmp.username).to.equal(USER_0.username);
            done();
        });
    });
});
