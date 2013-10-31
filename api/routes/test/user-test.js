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
var USERNAME_2 = 'user', PASSWORD_2 = 'userpassword', EMAIL_2 = 'user@foo.bar';
var USERNAME_3 = 'userTheThird', PASSWORD_3 = 'userpassword333', EMAIL_3 = 'user3@foo.bar';

var server;
function setup(done) {
    server = new Server(CONFIG);
    server.start(function (err) {
        database.USERS_TABLE.removeAll(done);
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

describe('Server User API', function () {
    this.timeout(5000);

    before(setup);
    after(cleanup);

    it('device is in first time mode', function (done) {
        request.get(SERVER_URL + '/api/v1/firsttime')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('create admin fails due to missing parameters', function (done) {
        request.post(SERVER_URL + '/api/v1/createadmin')
               .send({ username: USERNAME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create admin fails because only POST is allowed', function (done) {
        request.get(SERVER_URL + '/api/v1/createadmin')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(405);
            done(err);
        });
    });

    it('create admin', function (done) {
        request.post(SERVER_URL + '/api/v1/createadmin')
               .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            done(err);
        });
    });

    it('device left first time mode', function (done) {
        request.get(SERVER_URL + '/api/v1/firsttime')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(410);
            done(err);
        });
    });

    it('admin userInfo', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME);
            expect(res.body.email).to.equal(EMAIL);
            done(err);
        });
    });

    it('create token fails due to wrong credentials', function (done) {
        request.post(SERVER_URL + '/api/v1/token')
               .auth(USERNAME, 'wrong' + PASSWORD)
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('create token fails due to non basic auth header', function (done) {
        request.post(SERVER_URL + '/api/v1/token')
               .set('Authorization', USERNAME + ':wrong' + PASSWORD)
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create token fails due to broken basic auth header', function (done) {
        request.post(SERVER_URL + '/api/v1/token')
               .set('Authorization', 'Basic ' + USERNAME + ':wrong' + PASSWORD)
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create token fails due to wrong arguments', function (done) {
        request.post(SERVER_URL + '/api/v1/token')
               .auth(USERNAME, '')
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    var token;
    it('create token', function (done) {
        request.post(SERVER_URL + '/api/v1/token')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.token).to.be.a('string');
            token = res.body.token;
            expect(res.body.expires).to.be.a('string');
            expect(res.body.username).to.not.be.ok();
            expect(res.body.email).to.not.be.ok();
            done(err);
        });
    });

    it('can get userInfo with token', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .query({ auth_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME);
            expect(res.body.email).to.equal(EMAIL);
            done(err);
        });
    });

    it('cannot get userInfo with invalid token (token length)', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .query({ auth_token: 'x' + token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('cannot get userInfo with invalid token (unknown token)', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .query({ auth_token: token.toUpperCase() })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('can get userInfo with valid password but invalid token', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .auth(USERNAME, PASSWORD)
               .query({ auth_token: 'somerandomstuff' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME);
            expect(res.body.email).to.equal(EMAIL);
            done(err);
        });
    });

    it('create second admin should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/createadmin')
               .send({ username: USERNAME_2, password: PASSWORD, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('create user missing arguments should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/user/create')
               .auth(USERNAME, PASSWORD)
               .send({ username: USERNAME_2, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);

            request.post(SERVER_URL + '/api/v1/user/create')
                   .auth(USERNAME, PASSWORD)
                   .send({ username: USERNAME_2, password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done(err);
            });
        });
    });

    it('create second and third user as admin', function (done) {
        request.post(SERVER_URL + '/api/v1/user/create')
               .auth(USERNAME, PASSWORD)
               .send({ username: USERNAME_2, password: PASSWORD_2, email: EMAIL_2 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);

            request.post(SERVER_URL + '/api/v1/user/create')
                   .auth(USERNAME, PASSWORD)
                   .send({ username: USERNAME_3, password: PASSWORD_3, email: EMAIL_3 })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                done(err);
            });
        });
    });

    it('create user with same username should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/user/create')
               .auth(USERNAME, PASSWORD)
               .send({ username: USERNAME_2, password: PASSWORD, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(409);
            done(err);
        });
    });

    it('second user userInfo', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .auth(USERNAME_2, PASSWORD_2)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME_2);
            expect(res.body.email).to.equal(EMAIL_2);
            done(err);
        });
    });

    it('remove admin user by normal user should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/user/remove')
               .auth(USERNAME_2, PASSWORD_2)
               .send({ username: USERNAME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('removes itself', function (done) {
        request.post(SERVER_URL + '/api/v1/user/remove')
               .auth(USERNAME_2, PASSWORD_2)
               .send({ username: USERNAME_2 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('admin removes normal user', function (done) {
        request.post(SERVER_URL + '/api/v1/user/remove')
               .auth(USERNAME, PASSWORD)
               .send({ username: USERNAME_3 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('cannot logout with invalid token', function (done) {
        request.get(SERVER_URL + '/api/v1/logout')
               .query({ auth_token: token.toUpperCase() })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('can logout', function (done) {
        request.get(SERVER_URL + '/api/v1/logout')
               .query({ auth_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });

    it('cannot get userInfo with old token (previous logout)', function (done) {
        request.get(SERVER_URL + '/api/v1/user/info')
               .query({ auth_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('can login again', function (done) {
        request.post(SERVER_URL + '/api/v1/token')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.token).to.be.a('string');
            token = res.body.token;
            expect(res.body.expires).to.be.a('string');
            expect(res.body.username).to.not.be.ok();
            expect(res.body.email).to.not.be.ok();
            done(err);
        });
    });

    it('admin removes himself', function (done) {
        request.post(SERVER_URL + '/api/v1/user/remove')
               .auth(USERNAME, PASSWORD)
               .send({ username: USERNAME })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            done(err);
        });
    });
});