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
    groups = require('../../groups.js'),
    mailer = require('../../mailer.js'),
    superagent = require('superagent'),
    nock = require('nock'),
    server = require('../../server.js'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var USERNAME_0 = 'superaDmIn', PASSWORD = 'Foobar?1337', EMAIL_0 = 'silLY@me.com', EMAIL_0_NEW = 'stupID@me.com', DISPLAY_NAME_0_NEW = 'New Name';
var USERNAME_1 = 'userTheFirst', EMAIL_1 = 'taO@zen.mac';
var USERNAME_2 = 'userTheSecond', EMAIL_2 = 'USER@foo.bar', EMAIL_2_NEW = 'happy@ME.com';
var USERNAME_3 = 'userTheThird', EMAIL_3 = 'user3@FOO.bar';

describe('Profile API', function () {
    this.timeout(5000);

    var user_0, user_1, user_2, user_3 = null;
    var token_0;
    var token_1 = tokendb.generateToken();
    var token_2 = tokendb.generateToken();
    var token_3;

    function setup(done) {
        server.start(function (error) {
            expect(!error).to.be.ok();

            mailer._clearMailQueue();

            userdb._clear(function (error) {
                expect(error).to.eql(null);

                var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
                var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

                superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                       .query({ setupToken: 'somesetuptoken' })
                       .send({ username: USERNAME_0, password: PASSWORD, email: EMAIL_0 })
                       .end(function (err, res) {
                    expect(err).to.eql(null);
                    expect(res.statusCode).to.equal(201);

                    // stash for later use
                    token_0 = res.body.token;

                    expect(scope1.isDone()).to.be.ok();
                    expect(scope2.isDone()).to.be.ok();

                    done();
                });
            });
        });
    }

    function cleanup(done) {
        database._clear(function (error) {
            expect(!error).to.be.ok();

            mailer._clearMailQueue();

            server.stop(done);
        });
    }

    function checkMails(number, done) {
        // mails are enqueued async
        setTimeout(function () {
            expect(mailer._getMailQueue().length).to.equal(number);
            mailer._clearMailQueue();
            done();
        }, 500);
    }

    describe('get profile', function () {
        before(setup);
        after(cleanup);

        it('fails without token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/profile/').end(function (error, result) {
                expect(result.statusCode).to.equal(401);

                done();
            });
        });

        it('fails with empty token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/profile/').query({ access_token: '' }).end(function (error, result) {
                expect(result.statusCode).to.equal(401);

                done();
            });
        });

        it('fails with invalid token', function (done) {
            superagent.get(SERVER_URL + '/api/v1/profile/').query({ access_token: 'some token' }).end(function (error, result) {
                expect(result.statusCode).to.equal(401);

                done();
            });
        });

        it('succeeds', function (done) {
            superagent.get(SERVER_URL + '/api/v1/profile/').query({ access_token: token_0 }).end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(result.body.username).to.equal(USERNAME_0.toLowerCase());
                expect(result.body.email).to.equal(EMAIL_0.toLowerCase());
                expect(result.body.admin).to.be.ok();

                user_0 = result.body;

                done();
            });
        });

        it('fails with expired token', function (done) {
            var token = tokendb.generateToken();
            var expires = Date.now() + 2000; // 1 sec

            tokendb.add(token, tokendb.PREFIX_USER + user_0.id, null, expires, '*', function (error) {
                expect(error).to.not.be.ok();

                superagent.get(SERVER_URL + '/api/v1/profile/').query({ access_token: token }).end(function (error, result) {
                    expect(result.statusCode).to.equal(401);

                    done();
                });
            });
        });

        it('fails with invalid token in auth header', function (done) {
            superagent.get(SERVER_URL + '/api/v1/profile').set('Authorization', 'Bearer ' + 'x' + token_0).end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('succeeds with token in auth header', function (done) {
            superagent.get(SERVER_URL + '/api/v1/profile').set('Authorization', 'Bearer ' + token_0).end(function (error, result) {
                expect(result.statusCode).to.equal(200);
                expect(result.body.username).to.equal(USERNAME_0.toLowerCase());
                expect(result.body.email).to.equal(EMAIL_0.toLowerCase());
                expect(result.body.admin).to.be.ok();
                expect(result.body.displayName).to.be.a('string');
                expect(result.body.password).to.not.be.ok();
                expect(result.body.salt).to.not.be.ok();
                done();
            });
        });
    });

    describe('update', function () {
        before(setup);
        after(cleanup);

        it('change email fails due to missing token', function (done) {
            superagent.put(SERVER_URL + '/api/v1/profile')
                   .send({ email: EMAIL_0_NEW })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(401);
                done();
            });
        });

        it('change email fails due to invalid email', function (done) {
            superagent.put(SERVER_URL + '/api/v1/profile')
                   .query({ access_token: token_0 })
                   .send({ email: 'foo@bar' })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('change user succeeds without email nor displayName', function (done) {
            superagent.put(SERVER_URL + '/api/v1/profile')
                   .query({ access_token: token_0 })
                   .send({})
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(204);
                done();
            });
        });

        it('change email succeeds', function (done) {
            superagent.put(SERVER_URL + '/api/v1/profile')
                   .query({ access_token: token_0 })
                   .send({ email: EMAIL_0_NEW })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(204);

                superagent.get(SERVER_URL + '/api/v1/profile')
                      .query({ access_token: token_2 })
                      .end(function (err, res) {
                    expect(res.statusCode).to.equal(200);
                    expect(res.body.username).to.equal(USERNAME_0.toLowerCase());
                    expect(res.body.email).to.equal(EMAIL_0_NEW.toLowerCase());
                    expect(res.body.admin).to.equal(false);
                    expect(res.body.displayName).to.equal('');

                    done();
                });
            });
        });

        it('change displayName succeeds', function (done) {
            superagent.put(SERVER_URL + '/api/v1/profile')
                   .query({ access_token: token_0 })
                   .send({ displayName: DISPLAY_NAME_0_NEW })
                   .end(function (error, result) {
                expect(result.statusCode).to.equal(204);

                superagent.get(SERVER_URL + '/api/v1/profile')
                      .query({ access_token: token_0 })
                      .end(function (err, res) {
                    expect(res.statusCode).to.equal(200);
                    expect(res.body.username).to.equal(USERNAME_0.toLowerCase());
                    expect(res.body.email).to.equal(EMAIL_0.toLowerCase());
                    expect(res.body.admin).to.be.ok();
                    expect(res.body.displayName).to.equal(DISPLAY_NAME_0_NEW);

                    done();
                });
            });
        });
    });

    xdescribe('password change', function () {
        before(setup);
        after(after);

        // Change password
        it('change password fails due to missing current password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
                   .query({ access_token: token })
                   .send({ newPassword: 'some wrong password' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('change password fails due to missing new password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
                   .query({ access_token: token })
                   .send({ password: PASSWORD })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('change password fails due to wrong password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
                   .query({ access_token: token })
                   .send({ password: 'some wrong password', newPassword: 'MOre#$%34' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('change password fails due to invalid password', function (done) {
            superagent.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
                   .query({ access_token: token })
                   .send({ password: PASSWORD, newPassword: 'five' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done();
            });
        });

        it('change password succeeds', function (done) {
            superagent.post(SERVER_URL + '/api/v1/users/' + USERNAME_0 + '/password')
                   .query({ access_token: token })
                   .send({ password: PASSWORD, newPassword: 'MOre#$%34' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(204);
                done();
            });
        });
    });
});
