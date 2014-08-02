'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var Server = require('../../server.js'),
    request = require('superagent'),
    expect = require('expect.js'),
    userdb = require('../../userdb.js'),
    crypto = require('crypto'),
    rimraf = require('rimraf'),
    path = require('path'),
    os = require('os'),
    fs = require('fs'),
    appdb = require('../../appdb.js'),
    config = require('../../../config.js'),
    async = require('async');

var SERVER_URL = 'http://localhost:' + config.port;

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var TESTVOLUME = 'testvolume';
var token = null;

var server;
function setup(done) {
    server = new Server();
    async.series([
        server.start.bind(server),

        userdb.clear,

        function createAdmin(callback) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                 .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                 .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();
                callback();
            });
        },

        function createToken(callback) {
            request.post(SERVER_URL + '/api/v1/token')
                .auth(USERNAME, PASSWORD)
                .end(function (error, result) {
                    expect(error).to.be(null);
                    expect(result).to.be.ok();

                    token = result.body.token;
                    callback();
            });
        },

        function addApp(callback) {
            appdb.add('appid', appdb.ISTATE_PENDING_INSTALL, 'location', [ ] /* portBindings */, callback);
        }
    ], done);
}

// remove all temporary folders
function cleanup(done) {
    server.stop(function (error) {
        expect(error).to.be(null);
        rimraf(config.baseDir, done);
    });
}

describe('Settings API', function () {
    var volume;

    this.timeout(10000);

    before(setup);
    after(cleanup);

    it('can get domain domain (not set)', function (done) {
        request.get(SERVER_URL + '/api/v1/settings/naked_domain')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body).to.eql({ appid: '' });
            done(err);
        });
    });

    it('cannot set naked domain without appid', function (done) {
        request.post(SERVER_URL + '/api/v1/settings/naked_domain')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done();
        });
    });

    it('cannot set naked domain to invalid app', function (done) {
        request.post(SERVER_URL + '/api/v1/settings/naked_domain')
               .query({ access_token: token })
               .send({ appid: 'random' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done();
        });
    });
});

