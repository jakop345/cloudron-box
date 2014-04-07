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

var USERNAME = 'nobody';
var EMAIL = 'nobody@no.body';
var PASSWORD = 'foobar';
var NEW_PASSWORD = 'somenewpassword';

var OWNER = {
    username: 'admin1',
    password: 'test',
    email: 'admin@test.com'
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

        it('creation succeeds', function (done) {
            superagent.post(SERVER + '/owner').send(OWNER).end(function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.an('object');
                expect(result.statusCode).to.equal(201);

                done();
            });
        });
    });
});
