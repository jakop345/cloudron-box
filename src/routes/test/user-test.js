/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var config = require('../../config.js'),
    database = require('../../database.js'),
    tokendb = require('../../tokendb.js'),
    expect = require('expect.js'),
    request = require('superagent'),
    nock = require('nock'),
    server = require('../../server.js'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME_0 = 'admin', PASSWORD = 'password', EMAIL = 'silly@me.com', EMAIL_0_NEW = 'stupid@me.com';
var USERNAME_1 = 'userTheFirst', EMAIL_1 = 'tao@zen.mac';
var USERNAME_2 = 'userTheSecond', EMAIL_2 = 'user@foo.bar';
var USERNAME_3 = 'userTheThird', EMAIL_3 = 'user3@foo.bar';

var server;
function setup(done) {
    server.start(function (error) {
        expect(!error).to.be.ok();
        userdb._clear(done);
    });
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('User API', function () {
    this.timeout(5000);

    var user_0 = null;
    var token = null;
    var token_1 = tokendb.generateToken();
    var token_2 = tokendb.generateToken();

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
        var scope = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});

        request.post(SERVER_URL + '/api/v1/cloudron/activate')
               .query({ setupToken: 'somesetuptoken' })
               .send({ username: USERNAME_0 })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            expect(scope.isDone()).to.be.ok();
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
        var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
        var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

        request.post(SERVER_URL + '/api/v1/cloudron/activate')
               .query({ setupToken: 'somesetuptoken' })
               .send({ username: USERNAME_0, password: PASSWORD, email: EMAIL })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);

            // stash for later use
            token = res.body.token;

            expect(scope1.isDone()).to.be.ok();
            expect(scope2.isDone()).to.be.ok();
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

    it('can get userInfo with token', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_0)
        .query({ access_token: token })
        .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.username).to.equal(USERNAME_0);
            expect(res.body.email).to.equal(EMAIL);
            expect(res.body.admin).to.be.ok();

            // stash for further use
            user_0 = res.body;

            done(err);
        });
    });

    it('cannot get userInfo with expired token', function (done) {
        var token = tokendb.generateToken();
        var expires = Date.now() + 2000; // 1 sec

        tokendb.add(token, tokendb.PREFIX_USER + user_0.id, null, expires, '*', function (error) {
            expect(error).to.not.be.ok();

            setTimeout(function () {
                request.get(SERVER_URL + '/api/v1/users/' + user_0.username)
                .query({ access_token: token })
                .end(function (error, result) {
                    expect(error).to.not.be.ok();
                    expect(result.statusCode).to.equal(401);
                    done();
                });
            }, 2000);
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
            expect(res.body.password).to.not.be.ok();
            expect(res.body.salt).to.not.be.ok();
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

    it('create second user succeeds', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_1, email: EMAIL_1 })
               .end(function (err, res) {
            expect(err).to.not.be.ok();
            expect(res.statusCode).to.equal(201);

            // HACK to get a token for second user (passwords are generated and the user should have gotten a password setup link...)
            tokendb.add(token_1, tokendb.PREFIX_USER + USERNAME_1, 'test-client-id',  Date.now() + 10000, '*', done);
        });
    });

    it('set second user as admin succeeds', function (done) {
        // TODO is USERNAME_1 in body and url redundant?
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_1 + '/admin')
               .query({ access_token: token })
               .send({ username: USERNAME_1, admin: true })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
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
               .send({ password: PASSWORD })
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

    it('create user missing username fails', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ email: EMAIL_2 })
               .end(function (error, result) {
            expect(error).to.not.be.ok();
            expect(result.statusCode).to.equal(400);
            done();
        });
    });

    it('create user missing email fails', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_2 })
               .end(function (error, result) {
            expect(error).to.not.be.ok();
            expect(result.statusCode).to.equal(400);
            done();
        });
    });

    it('create second and third user', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_2, email: EMAIL_2 })
               .end(function (error, res) {
            expect(error).to.not.be.ok();
            expect(res.statusCode).to.equal(201);

            request.post(SERVER_URL + '/api/v1/users')
                   .query({ access_token: token })
                   .send({ username: USERNAME_3, email: EMAIL_3 })
                   .end(function (error, res) {
                expect(error).to.not.be.ok();
                expect(res.statusCode).to.equal(201);

                // HACK to get a token for second user (passwords are generated and the user should have gotten a password setup link...)
                tokendb.add(token_2, tokendb.PREFIX_USER + USERNAME_2, 'test-client-id',  Date.now() + 10000, '*', done);
            });
        });
    });

    it('second user userInfo', function (done) {
        request.get(SERVER_URL + '/api/v1/users/' + USERNAME_2)
               .query({ access_token: token_1 })
               .end(function (error, result) {
            expect(error).to.be(null);
            expect(result.statusCode).to.equal(200);
            expect(result.body.username).to.equal(USERNAME_2);
            expect(result.body.email).to.equal(EMAIL_2);
            expect(result.body.admin).to.not.be.ok();

            done();
        });
    });

    it('create user with same username should fail', function (done) {
        request.post(SERVER_URL + '/api/v1/users')
               .query({ access_token: token })
               .send({ username: USERNAME_2, email: EMAIL })
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

            res.body.users.forEach(function (user) {
                expect(user).to.be.an('object');
                expect(user.id).to.be.ok();
                expect(user.username).to.be.ok();
                expect(user.email).to.be.ok();
                expect(user.password).to.not.be.ok();
                expect(user.salt).to.not.be.ok();
            });

            done();
        });
    });

    it('user removes himself is not allowed', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('admin cannot remove normal user without giving a password', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('admin cannot remove normal user with empty password', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .send({ password: '' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('admin cannot remove normal user with giving wrong password', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .send({ password: PASSWORD + PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('admin removes normal user', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_3)
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done(err);
        });
    });

    it('admin removes himself should not be allowed', function (done) {
        request.del(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ password: PASSWORD })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    // Change email
    it('change email fails due to missing token', function (done) {
        request.put(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .send({ password: PASSWORD, email: EMAIL_0_NEW })
               .end(function (error, result) {
            expect(result.statusCode).to.equal(401);
            done(error);
        });
    });

    it('change email fails due to missing password', function (done) {
        request.put(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ email: EMAIL_0_NEW })
               .end(function (error, result) {
            expect(result.statusCode).to.equal(400);
            done(error);
        });
    });

    it('change email fails due to wrong password', function (done) {
        request.put(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ password: PASSWORD+PASSWORD, email: EMAIL_0_NEW })
               .end(function (error, result) {
            expect(result.statusCode).to.equal(403);
            done(error);
        });
    });

    it('change email fails due to invalid email', function (done) {
        request.put(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ password: PASSWORD, email: 'foo@bar' })
               .end(function (error, result) {
            expect(result.statusCode).to.equal(400);
            done(error);
        });
    });

    it('change email succeeds', function (done) {
        request.put(SERVER_URL + '/api/v1/users/' + USERNAME_0)
               .query({ access_token: token })
               .send({ password: PASSWORD, email: EMAIL_0_NEW })
               .end(function (error, result) {
            expect(result.statusCode).to.equal(204);
            done(error);
        });
    });

    // Change password
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
               .send({ password: 'some wrong password', newPassword: 'newpassword' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(403);
            done(err);
        });
    });

    it('change password fails due to invalid password', function (done) {
        request.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
               .query({ access_token: token })
               .send({ password: PASSWORD, newPassword: 'five' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
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
