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
    server.start(function (error) {
        expect(error).to.not.be.ok();

        database.USERS_TABLE.removeAll(function () {
            request.post(SERVER_URL + '/api/v1/createadmin')
                 .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                 .end(function (error, res) {
                expect(error).to.not.be.ok();
                done();
            });
        });
    });
}

// remove all temporary folders
function cleanup(done) {
    server.stop(function (error) {
        rimraf(BASE_DIR, function (error) {
            done();
        });
    });
}

// function checks if obj has all but only the specified properties
function checkObjectHasOnly(obj, properties) {
    var prop;
    var found = {};

    for (prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            if (properties.hasOwnProperty(prop)) {
                expect(obj[prop]).to.be.a(properties[prop]);
                found[prop] = true;
            } else {
                throw('Expect result to not have property ' + prop);
            }
        }
    }

    for (prop in properties) {
        if (properties.hasOwnProperty(prop) && !found.hasOwnProperty(prop)) {
            throw('Expect result to have property ' + prop);
        }
    }
}

describe('Server Volume API', function () {
    this.timeout(5000);

    before(setup);
    after(cleanup);

    it('create fails due to missing password', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/create')
               .auth(USERNAME, PASSWORD)
               .send({ name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create fails due to wrong password', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/create')
               .auth(USERNAME, PASSWORD)
               .send({ password: PASSWORD+PASSWORD, name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
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
            expect(res.body.volumes).to.be.an(Object);
            expect(res.body.volumes.length).to.equal(1);
            expect(res.body.volumes[0].name).to.equal(TESTVOLUME);
            expect(res.statusCode).to.equal(200);

            // check for result object sanity
            checkObjectHasOnly(res.body.volumes[0], {name: 'string', isMounted: 'boolean'});

            done(err);
        });
    });

    it('listFiles', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/list')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            var foundReadme = false;
            res.body.entries.forEach(function (entry) {
                checkObjectHasOnly(entry, {
                    path: 'string',
                    mode : 'number',
                    size: 'number',
                    sha1: 'string',
                    name: 'string',
                    mtime: 'number'
                });
                if (entry.path === 'README.md') foundReadme = true;
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

    it('mount volume should fail due to wrong password', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/mount')
               .auth(USERNAME, PASSWORD)
               .send({ password: 'some random password' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
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

    xdescribe('multiple users', function () {
        var TEST_VOLUME = 'user-management-test-volume';
        var TEST_PASSWORD_0 = 'password0';
        var TEST_PASSWORD_1 = 'password1';
        var TEST_USER_0 = { username: 'user0', email: 'xx@xx.xx', password: TEST_PASSWORD_0 };
        var TEST_USER_1 = { username: 'user1', email: 'xx@xx.xx', password: TEST_PASSWORD_1 };

        before(function (done) {
            this.timeout(5000); // on the Mac, creating volumes takes a lot of time on low battery
            request.post(SERVER_URL + '/api/v1/volume/create')
                   .auth(TEST_USER_0.username, TEST_USER_0.password)
                   .send({ password: TEST_USER_0.password, name: TEST_VOLUME })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                done(err);
            });
        });

        it('cannot add user due to wrong creator password', function (done) {

        });

        xit('removing one user from volume does not delete it', function (done) {

        });
    });
});
