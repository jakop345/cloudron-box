'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var Server = require('../../server.js'),
    request = require('superagent'),
    expect = require('expect.js'),
    database = require('../../database.js'),
    crypto = require('crypto'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    path = require('path'),
    os = require('os');

var SERVER_URL = 'http://localhost:3000';
var BASE_DIR = path.resolve(os.tmpdir(), 'volume-test-' + crypto.randomBytes(4).readUInt32LE(0));
var CONFIG = {
    port: 3000,
    dataRoot: path.resolve(BASE_DIR, 'data'),
    configRoot: path.resolve(BASE_DIR, 'config'),
    mountRoot: path.resolve(BASE_DIR, 'mount'),
    silent: true
};

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var TESTVOLUME = 'testvolume';

var server;
function setup(done) {
    server = new Server(CONFIG);
    server.start(function (err) {
        database.USERS_TABLE.removeAll(function () {
            request.post(SERVER_URL + '/api/v1/createadmin')
                 .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                 .end(function (err, res) {
                done();
            });
        });
    });
}

// remove all temporary folders
function cleanup(done) {
    server.stop(function (err) {
        rimraf(BASE_DIR, function (error) {
            done();
        });
    });
}

function now() { return (new Date()).getTime(); }
function tempFile(contents) {
    var file = path.join(os.tmpdir(), '' + crypto.randomBytes(4).readUInt32LE(0));
    fs.writeFileSync(file, contents);
    return file;
}

describe('Server Volume API', function () {
    this.timeout(5000);

    before(setup);
    after(cleanup);

    it('create fails due to missing password', function (done) {
        this.timeout(5000); // on the Mac, creating volumes takes a lot of time on low battery
        request.post(SERVER_URL + '/api/v1/volume/create')
               .auth(USERNAME, PASSWORD)
               .send({ name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create', function (done) {
        this.timeout(5000); // on the Mac, creating volumes takes a lot of time on low battery
        request.post(SERVER_URL + '/api/v1/volume/create')
               .auth(USERNAME, PASSWORD)
               .send({ password: PASSWORD, name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            done(err);
        });
    });

    it('list', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/list')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.body.length).to.equal(1);
            expect(res.body[0].name).to.equal(TESTVOLUME);
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('listFiles', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/list/')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            var foundReadme = false;
            res.body.forEach(function (entry) {
                expect(entry.filename).to.be.a("string");
                expect(entry.stat).to.be.an("object");
                expect(entry.stat.size).to.be.a("number");

                if (entry.filename === 'README.md') foundReadme = true;
            });
            expect(foundReadme).to.be(true);
            done(err);
        });
    });

    it('unmount volume', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/unmount')
               .auth(USERNAME, PASSWORD)
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('volume should not be mounted', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/ismounted')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.mounted).to.not.be.ok();
            done(err);
        });
    });

    it('mount volume', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/mount')
               .auth(USERNAME, PASSWORD)
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('volume should be mounted', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/ismounted')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.mounted).to.be.ok();
            done(err);
        });
    });

    it('destroy fails due to missing password', function(done) {
        request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/delete')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('destroy', function(done) {
        request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/delete')
               .auth(USERNAME, PASSWORD)
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('bad volume', function (done) {
        request.get(SERVER_URL + '/api/v1/file/whatever/volume')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
        });
    });
});
