'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var os = require('os'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    crypto = require('crypto'),
    expect = require('expect.js'),
    rimraf = require('rimraf'),
    superagent = require('superagent'),
    Server = require('../server');

var OWNER = {
    username: 'admin1',
    password: 'test',
    email: 'admin@test.com'
};

var USER_0 = {
    username: 'jzellner',
    password: 'randomness',
    email: 'j@z.com'
};

var PORT = 3001;
var SERVER = 'http://localhost:' + PORT + '/auth/api/v1';

var tmpdirname = 'auth-server-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.resolve(os.tmpdir(), tmpdirname);

function setup(done) {
    mkdirp(tmpdir, function (error) {
        expect(error).to.be(null);
        done();
    });
}

function cleanup(done) {
    rimraf(tmpdir, function (error) {
        expect(error).to.not.be.ok();
        done();
    });
}

describe('Server', function () {
    before(setup);
    after(cleanup);

    var server = null;

    describe('instance', function () {
        describe('creation', function () {
            it('fails because of invalid arguments', function () {
                expect(function () { new Server(); }).to.throwException();
                expect(function () { new Server('3000', 'foo', true); }).to.throwException();
                expect(function () { new Server(3000, {}, true); }).to.throwException();
                expect(function () { new Server(3000, 'foo', 1); }).to.throwException();
            });

            it('succeeds', function () {
                server = new Server(PORT, tmpdir, true);
                expect(server).to.be.an('object');
            });
        });

        describe('start', function () {
            it('fails because of invalid arguments', function () {
                expect(function () { new Server(); }).to.throwException();
                expect(function () { new Server('3000'); }).to.throwException();
                expect(function () { new Server(3000); }).to.throwException();
                expect(function () { new Server({}); }).to.throwException();
            });

            it('succeeds', function (done) {
                server.start(function (error) {
                    expect(error).to.be(null);
                    done();
                });
            });
        });

        describe('stop', function () {
            it('fails because of invalid arguments', function () {
                expect(function () { new Server(); }).to.throwException();
                expect(function () { new Server('3000'); }).to.throwException();
                expect(function () { new Server(3000); }).to.throwException();
                expect(function () { new Server({}); }).to.throwException();
            });

            it('succeeds', function (done) {
                server.stop(function (error) {
                    expect(error).to.be(null);
                    done();
                });
            });
        });
    });

    describe('owner', function () {
        var server = null;

        before(function (done) {
            server = new Server(PORT, tmpdir, true);
            server.start(done);
        });

        after(function (done) {
            server.stop(done);
        });

        describe('creation', function () {
            it('succeeds', function (done) {
                superagent.post(SERVER + '/owner').send(OWNER).end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(201);

                    done();
                });
            });

            it('fails, owner already exists', function (done) {
                superagent.post(SERVER + '/owner').send(OWNER).end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(409);

                    done();
                });
            });
        });
    });

    describe('user', function () {
        var server = null;
        var ownerToken = null;

        before(function (done) {
            server = new Server(PORT, tmpdir, true);
            server.start(done);
        });

        after(function (done) {
            server.stop(done);
        });

        describe('token', function () {
            it('can be obtained with basic auth', function (done) {
                superagent.post(SERVER + '/users/token').send({ username: OWNER.username, password: OWNER.password}).end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(200);
                    expect(result.body.accessToken).to.be.a('string');

                    // cache for further use
                    ownerToken = result.body.accessToken;

                    done();
                });
            });
        });

        describe('creation', function () {
            it('fails, due to missing access token', function (done) {
                superagent.post(SERVER + '/users')
                .send(USER_0)
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('fails, due to wrong access token', function (done) {
                superagent.post(SERVER + '/users')
                .send(USER_0)
                .query({ access_token: ownerToken+ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('succeeds', function (done) {
                superagent.post(SERVER + '/users')
                .send(USER_0)
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(201);

                    done();
                });
            });

            it('fails, user already exists', function (done) {
                superagent.post(SERVER + '/users')
                .send(USER_0)
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(409);

                    done();
                });
            });
        });

        describe('retrieval', function () {
            it('fails, due to missing access token', function (done) {
                superagent.get(SERVER + '/users/' + USER_0.username)
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('fails, due to wrong access token', function (done) {
                superagent.get(SERVER + '/users/' + USER_0.username)
                .query({ access_token: ownerToken+ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('succeeds', function (done) {
                superagent.get(SERVER + '/users/' + USER_0.username)
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(200);
                    expect(result.body.id).to.equal(USER_0.username);
                    expect(result.body.username).to.equal(USER_0.username);
                    expect(result.body.email).to.equal(USER_0.email);

                    done();
                });
            });

            it('fails, due to wrong unknown user id', function (done) {
                superagent.get(SERVER + '/users/' + 'someUnknownUserId')
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(404);

                    done();
                });
            });
        });

        describe('list', function () {
            it('fails, due to missing access token', function (done) {
                superagent.get(SERVER + '/users')
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('fails, due to wrong access token', function (done) {
                superagent.get(SERVER + '/users')
                .query({ access_token: ownerToken+ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('succeeds', function (done) {
                superagent.get(SERVER + '/users')
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(200);
                    expect(result.body.users).to.be.an(Array);
                    expect(result.body.users.length).to.equal(2);
                    expect(result.body.users[0].username).to.be.a('string');
                    expect(result.body.users[1].username).to.be.a('string');

                    done();
                });
            });
        });

        describe('removal', function () {
            it('fails, due to missing access token', function (done) {
                superagent.del(SERVER + '/users/' + USER_0.username)
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('fails, due to wrong access token', function (done) {
                superagent.del(SERVER + '/users/' + USER_0.username)
                .query({ access_token: ownerToken+ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });

            it('succeeds', function (done) {
                superagent.del(SERVER + '/users/' + USER_0.username)
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(200);

                    done();
                });
            });

            it('fails, due to previously removed user', function (done) {
                superagent.get(SERVER + '/users/' + USER_0.username)
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(404);

                    done();
                });
            });

            it('fails, due to previously removed user', function (done) {
                superagent.get(SERVER + '/users/' + USER_0.username)
                .query({ access_token: ownerToken })
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.an('object');
                    expect(result.statusCode).to.equal(404);

                    done();
                });
            });
        });
    });
});
