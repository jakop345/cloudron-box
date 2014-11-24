/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var config = require('../../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    request = require('superagent'),
    server = require('../../../src/server.js'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME_0 = 'admin', PASSWORD = 'password', EMAIL ='silly@me.com';
var USERNAME_1 = 'userTheFirst', PASSWORD_1 = 'chocolatecookie', EMAIL_1 = 'tao@zen.mac';
var USERNAME_2 = 'userTheSecond', PASSWORD_2 = 'userpassword', EMAIL_2 = 'user@foo.bar';
var USERNAME_3 = 'userTheThird', PASSWORD_3 = 'userpassword333', EMAIL_3 = 'user3@foo.bar';

var server;
function setup(done) {
    server.start(function (error) {
        expect(!error).to.be.ok();
        userdb.clear(done);
    });
}

function cleanup(done) {
    database.clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('User API', function () {
    this.timeout(5000);

    var token = null;
    var token_1 = null;
    var token_2 = null;

    before(setup);
    after(cleanup);

    it('device is in first time mode', function (done) {
        request.get(SERVER_URL + '/api/v1/cloudron/status')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.activated).to.not.be.ok();
            done(err);
        });
    });

    it('create admin fails due to missing parameters', function (done) {
        request.post(SERVER_URL + '/api/v1/cloudron/activate')
               .send({ username: USERNAME_0 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('create admin fails because only POST is allowed', function (done) {
        request.get(SERVER_URL + '/api/v1/cloudron/activate')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done(err);
        });
    });

    it('create admin', function (done) {
        request.post(SERVER_URL + '/api/v1/cloudron/activate')
               .send({ username: USERNAME_0, password: PASSWORD, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            done(err);
        });
    });

    it('device left first time mode', function (done) {
        request.get(SERVER_URL + '/api/v1/cloudron/status')
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.activated).to.be.ok();
            done(err);
        });
    });

    it('login fails due to wrong credentials', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/login')
               .auth(USERNAME_0, 'wrong' + PASSWORD)
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('login fails due to non basic auth header', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/login')
               .set('Authorization', USERNAME_0 + ':wrong' + PASSWORD)
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('login fails due to broken basic auth header', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/login')
               .set('Authorization', 'Basic ' + USERNAME_0 + ':wrong' + PASSWORD)
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('login fails due to wrong arguments', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/login')
               .auth(USERNAME_0, '')
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('login succeeds', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/login')
               .auth(USERNAME_0, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.token).to.be.a('string');
            expect(res.body.expires).to.be.a('string');
            expect(res.body.username).to.not.be.ok();
            expect(res.body.email).to.not.be.ok();
            expect(res.body.userInfo).to.be.ok();
            expect(res.body.userInfo.username).to.be.ok();
            expect(res.body.userInfo.admin).to.be.ok();

            // save token for further calls
            token = res.body.token;

            done(err);
        });
    });

    it('can get userInfo with token', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME_0);
            expect(res.body.email).to.equal(EMAIL);
            expect(res.body.admin).to.be.ok();
            done(err);
        });
    });

    it('cannot get userInfo only with basic auth', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .auth(USERNAME_0, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('cannot get userInfo with invalid token (token length)', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: 'x' + token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('cannot get userInfo with invalid token (wrong token)', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token.toUpperCase() })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('can get userInfo with token in auth header', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .set('Authorization', 'Bearer ' + token)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME_0);
            expect(res.body.email).to.equal(EMAIL);
            expect(res.body.admin).to.be.ok();
            done(err);
        });
    });

    it('cannot get userInfo with invalid token in auth header', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .set('Authorization', 'Bearer ' + 'x' + token)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('cannot get userInfo with invalid token (wrong token)', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .set('Authorization', 'Bearer ' + 'x' + token.toUpperCase())
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('create second admin should succeed with first admin credentials', function (done) {
        request.post(SERVER_URL + '/api/v1/cloudron/activate')
               .query({ access_token: token })
               .send({ username: USERNAME_1, password: PASSWORD_1, email: EMAIL_1 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            done(err);
        });
    });

    it('get second admin token', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_1 + '/login')
               .auth(USERNAME_1, PASSWORD_1)
               .end(function (error, result) {
            expect(error).to.be(null);
            expect(result.body.token).to.be.a('string');

            // safe token for further calls
            token_1 = result.body.token;

            done();
        });
    });

    it('remove first user from admins succeeds', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/admin')
               .query({ access_token: token_1 })
               .send({ username: USERNAME_0, admin: false })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
        });
    });

    it('remove second user by first, now normal, user fails', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_1)
               .query({ access_token: token })
               .send({ username: USERNAME_1, password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('remove second user from admins and thus last admin fails', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_1 + '/admin')
               .query({ access_token: token_1 })
               .send({ username: USERNAME_1, admin: false })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('reset first user as admin succeeds', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/admin')
               .query({ access_token: token_1 })
               .send({ username: USERNAME_0, admin: true })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
        });
    });

    it('create user missing arguments should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_2, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);

            request.post(SERVER_URL + '/api/v1/users')
                   .query({ access_token: token })
                   .send({ username: USERNAME_2, password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done(err);
            });
        });
    });

    it('create second and third user', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_2, password: PASSWORD_2, email: EMAIL_2 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);

            request.post(SERVER_URL + '/api/v1/users')
                   .query({ access_token: token })
                   .send({ username: USERNAME_3, password: PASSWORD_3, email: EMAIL_3 })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                done(err);
            });
        });
    });

    it('second user userInfo', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_1 + '/login')
               .auth(USERNAME_2, PASSWORD_2)
               .end(function (error, result) {
            expect(error).to.be(null);
            expect(result.body.token).to.be.a('string');

            // safe token for further calls
            token_2 = result.body.token;

            request.get(SERVER_URL + '/api/v1/users/' + USERNAME_1)
                   .query({ access_token: token_2 })
                   .end(function (error, result) {
                expect(error).to.be(null);
                expect(result.statusCode).to.equal(200);
                expect(result.body.username).to.equal(USERNAME_2);
                expect(result.body.email).to.equal(EMAIL_2);
                expect(result.body.admin).to.not.be.ok();

                done();
            });
        });
    });

    it('create user with same username should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_2, password: PASSWORD, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(409);
            done(err);
        });
    });

    it('list users', function (done) {
        request.get(SERVER_URL + '/api/v1/users')
        .query({ access_token: token_2 })
        .end(function (error, res) {
            expect(error).to.be(null);
            expect(res.statusCode).to.equal(200);
            expect(res.body.users).to.be.an('array');
            expect(res.body.users.length).to.equal(4);
            expect(res.body.users[0]).to.be.an('object');

            done();
        });
    });

    it('remove admin user by normal user should fail', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token_2 })
               .send({ username: USERNAME_0, password: PASSWORD_2 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('user removes himself is not allowed', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_2)
               .query({ access_token: token_2 })
               .send({ username: USERNAME_2, password: PASSWORD_2 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('admin cannot remove normal user without giving a password', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .send({ username: USERNAME_3 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('admin cannot remove normal user with giving wrong password', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .send({ username: USERNAME_3, password: PASSWORD_3 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('admin removes normal user', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .send({ username: USERNAME_3, password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
        });
    });

    it('cannot logout with invalid token', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/logout')
               .query({ access_token: token.toUpperCase() })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('can logout', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/logout')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
        });
    });

    it('cannot get userInfo with old token (previous logout)', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done(err);
        });
    });

    it('can login again', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/login')
               .auth(USERNAME_0, PASSWORD)
               .end(function (error, res) {
            expect(error).to.be(null);
            expect(res.statusCode).to.equal(200);
            expect(res.body.token).to.be.a('string');
            token = res.body.token;

            expect(res.body.expires).to.be.a('string');
            expect(res.body.username).to.not.be.ok();
            expect(res.body.email).to.not.be.ok();

            done();
        });
    });

    it('admin removes himself should not be allowed', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ username: USERNAME_0, password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('change password fails due to missing current password', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
               .query({ access_token: token })
               .send({ newPassword: 'some wrong password' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('change password fails due to missing new password', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('change password fails due to wrong password', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
               .query({ access_token: token })
               .send({ password: 'some wrong password', newPassword: 'new_password' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

      it('change password succeeds', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
               .query({ access_token: token })
               .send({ password: PASSWORD, newPassword: 'new_password' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
        });
    });
});
