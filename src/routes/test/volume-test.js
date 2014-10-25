/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    config = require('../../../config.js'),
    expect = require('expect.js'),
    fs = require('fs'),
    path = require('path'),
    paths = require('../../paths.js'),
    request = require('superagent'),
    Server = require('../../server.js'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var TESTVOLUME = 'testvolume';
var token = null;

var server;
function setup(done) {
    server = new Server();
    async.series([
        server.start.bind(server),

        userdb.clear,

        function (callback) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (error, result) {
                expect(error).to.be(null);
                expect(result).to.be.ok();
                callback();
            });
        },

        function (callback) {
            request.get(SERVER_URL + '/api/v1/users/' + USERNAME + '/login')
                   .auth(USERNAME, PASSWORD)
                   .end(function (error, result) {
                token = result.body.token;
                callback();
            });
        }
    ], done);
}

function cleanup(done) {
    server.stop(done);
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
    var volume;

    this.timeout(10000);

    before(setup);
    after(cleanup);

    it('create fails due to missing password', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/create')
               .query({ access_token: token })
               .send({ name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create fails due to wrong password', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/create')
               .query({ access_token: token })
               .send({ password: PASSWORD+PASSWORD, name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('create', function (done) {
        this.timeout(10000); // on the Mac, creating volumes takes a lot of time on low battery
        request.post(SERVER_URL + '/api/v1/volume/create')
               .query({ access_token: token })
               .send({ password: PASSWORD, name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);

            // cache it for later use
            volume = res.body;

            done(err);
        });
    });

    it('list', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/list')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.body.volumes).to.be.an(Object);
            expect(res.body.volumes.length).to.equal(1);
            expect(res.body.volumes[0].name).to.equal(TESTVOLUME);
            expect(res.statusCode).to.equal(200);

            // check for result object sanity
            checkObjectHasOnly(res.body.volumes[0], {name: 'string', isMounted: 'boolean', id: 'string', users: 'object'});

            done(err);
        });
    });

    it('listFiles', function (done) {
        fs.writeFileSync(path.join(paths.VOLUMES_MOUNT_DIR, volume.id + '/README.md'), 'test data');

        request.get(SERVER_URL + '/api/v1/volume/' + volume.id + '/list')
               .query({ access_token: token })
               .end(function (err, res) {
            var foundReadme = false;
            res.body.entries.forEach(function (entry) {
                checkObjectHasOnly(entry, {
                    path: 'string',
                    mode : 'number',
                    size: 'number',
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
        request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/unmount')
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('volume should not be mounted', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + volume.id + '/ismounted')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.mounted).to.not.be.ok();
            done(err);
        });
    });

    it('mount volume should fail due to wrong password', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/mount')
               .query({ access_token: token })
               .send({ password: 'some random password' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('mount volume', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/mount')
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('volume should be mounted', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + volume.id + '/ismounted')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.mounted).to.be.ok();
            done(err);
        });
    });

    it('destroy fails due to missing password', function(done) {
        request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/delete')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('destroy fails due to wrong password', function(done) {
        request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/delete')
               .query({ access_token: token })
               .send({ password: PASSWORD + PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('destroy', function(done) {
        request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/delete')
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('bad volume', function (done) {
        request.get(SERVER_URL + '/api/v1/file/whatever/volume')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
        });
    });

    describe('multiple users', function () {
        var TEST_VOLUME = 'user-management-test-volume';
        var USERNAME_2 = 'usertwo';
        var PASSWORD_2 = 'passwordtwo';
        var EMAIL_2 = 'email@two.com';

        var volume;

        before(function (done) {
            this.timeout(10000); // on the Mac, creating volumes takes a lot of time on low battery

            request.post(SERVER_URL + '/api/v1/volume/create')
                   .query({ access_token: token })
                   .send({ password: PASSWORD, name: TEST_VOLUME })
                   .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(201);

                // cache for further use
                volume = result.body;

                request.post(SERVER_URL + '/api/v1/users')
                       .query({ access_token: token })
                       .send({ username: USERNAME_2, password: PASSWORD_2, email: EMAIL_2 })
                       .end(function (error, result) {
                    expect(result.statusCode).to.equal(201);

                    done(error);
                });
            });
        });

        it('can list volume users', function (done) {
            request.get(SERVER_URL + '/api/v1/volume/' + volume.id + '/users')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.users).to.be.an(Array);
                expect(result.body.users.length).to.be(1);

                done();
            });
        });

        it('cannot add user due to missing owner password', function (done) {
            request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/users')
            .query({ access_token: token })
            .send({ username: USERNAME_2 })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);

                done();
            });
        });

        it('cannot add user due to wrong owner password', function (done) {
            // CAUTION!!! override console.error to reduce noise
            var tmp = console.error;
            console.error = function () {};

            request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/users')
            .query({ access_token: token })
            .send({ username: USERNAME_2, password: PASSWORD + PASSWORD })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);

                console.error = tmp;

                done();
            });
        });

        it('cannot add user due to unknown user', function (done) {
            request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/users')
            .query({ access_token: token })
            .send({ username: USERNAME_2 + USERNAME_2, password: PASSWORD + PASSWORD })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(405);

                done();
            });
        });

        it('adding second user succeeds', function (done) {
            request.post(SERVER_URL + '/api/v1/volume/' + volume.id + '/users')
            .query({ access_token: token })
            .send({ username: USERNAME_2, password: PASSWORD })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);

                done();
            });
        });

        it('can list volume updated users', function (done) {
            request.get(SERVER_URL + '/api/v1/volume/' + volume.id + '/users')
            .query({ access_token: token })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);
                expect(result.body.users).to.be.an(Array);
                expect(result.body.users.length).to.be(2);

                done();
            });
        });

        it('removing one user fails due to missing username', function (done) {
            request.del(SERVER_URL + '/api/v1/volume/' + volume.id + '/users/')
            .auth(USERNAME_2, PASSWORD_2)
            .set({ password: PASSWORD_2 + PASSWORD_2 })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(404);

                done();
            });
        });

        it('removing one user fails due to unknown username', function (done) {
            request.del(SERVER_URL + '/api/v1/volume/' + volume.id + '/users/unknownuser')
            .auth(USERNAME_2, PASSWORD_2)
            .set({ password: PASSWORD_2 })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(405);

                done();
            });
        });

        it('removing second user fails due to wrong password', function (done) {
            request.del(SERVER_URL + '/api/v1/volume/' + volume.id + '/users/' + USERNAME_2)
            .auth(USERNAME_2, PASSWORD_2)
            .set({ password: PASSWORD_2 + PASSWORD_2 })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);

                done();
            });
        });

        it('removing second user from volume succeeds', function (done) {
            request.del(SERVER_URL + '/api/v1/volume/' + volume.id + '/users/' + USERNAME_2)
            .auth(USERNAME_2, PASSWORD_2)
            .set({ password: PASSWORD_2 })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);

                done();
            });
        });

        it('removing second user fails due to user does not have access anymore', function (done) {
            request.del(SERVER_URL + '/api/v1/volume/' + volume.id + '/users/' + USERNAME_2)
            .query({ access_token: token })
            .set({ password: PASSWORD })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(401);

                done();
            });
        });

        it('removing last user for this volume succeeds', function (done) {
            request.del(SERVER_URL + '/api/v1/volume/' + volume.id + '/users/' + USERNAME)
            .query({ access_token: token })
            .set({ password: PASSWORD })
            .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(200);

                done();
            });
        });

        it('all users removed, volume should be gone', function (done) {
            request.get(SERVER_URL + '/api/v1/volume/list')
               .query({ access_token: token })
               .end(function (err, res) {
                expect(res.body.volumes).to.be.an(Object);
                expect(res.body.volumes.length).to.equal(0);

                done(err);
            });
        });
    });
});
