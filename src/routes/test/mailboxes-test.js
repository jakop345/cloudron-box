/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    config = require('../../config.js'),
    database = require('../../database.js'),
    expect = require('expect.js'),
    superagent = require('superagent'),
    server = require('../../server.js'),
    nock = require('nock'),
    userdb = require('../../userdb.js');

var SERVER_URL = 'http://localhost:' + config.get('port');

var MAILBOX_ID = 'mailbox';

var USERNAME = 'superadmin', PASSWORD = 'Foobar?1337', EMAIL ='silly@me.com';
var token = null;

var server;
function setup(done) {
    config.set('fqdn', 'foobar.com');

    async.series([
        server.start.bind(server),

        userdb._clear,

        function createAdmin(callback) {
            var scope1 = nock(config.apiServerOrigin()).get('/api/v1/boxes/' + config.fqdn() + '/setup/verify?setupToken=somesetuptoken').reply(200, {});
            var scope2 = nock(config.apiServerOrigin()).post('/api/v1/boxes/' + config.fqdn() + '/setup/done?setupToken=somesetuptoken').reply(201, {});

            superagent.post(SERVER_URL + '/api/v1/cloudron/activate')
                   .query({ setupToken: 'somesetuptoken' })
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (error, result) {
                expect(result).to.be.ok();
                expect(result.statusCode).to.eql(201);
                expect(scope1.isDone()).to.be.ok();
                expect(scope2.isDone()).to.be.ok();

                // stash token for further use
                token = result.body.token;

                callback();
            });
        }
    ], done);
}

function cleanup(done) {
    database._clear(function (error) {
        expect(!error).to.be.ok();

        server.stop(done);
    });
}

describe('Mailbox API', function () {
    this.timeout(10000);

    before(setup);
    after(cleanup);

    it('cannot create a mailbox without name param', function (done) {
        superagent.post(SERVER_URL + '/api/v1/mailboxes')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done();
        });
    });

    it('cannot create a mailbox without token', function (done) {
        superagent.post(SERVER_URL + '/api/v1/mailboxes')
               .send({ name: MAILBOX_ID })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(401);
            done();
        });
    });

    it('cannot create invalid mailbox', function (done) {
        superagent.post(SERVER_URL + '/api/v1/mailboxes')
               .query({ access_token: token })
               .send({ name: 'no-reply' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done();
        });
    });

    it('can create mailbox', function (done) {
        superagent.post(SERVER_URL + '/api/v1/mailboxes')
               .query({ access_token: token })
               .send({ name: MAILBOX_ID })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            done();
        });
    });

    it('can get mailbox', function (done) {
        superagent.get(SERVER_URL + '/api/v1/mailboxes/' + MAILBOX_ID)
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.name).to.equal(MAILBOX_ID);
            expect(res.body.creationTime).to.be.ok();
            done();
        });
    });

    it('can list mailboxes', function (done) {
        superagent.get(SERVER_URL + '/api/v1/mailboxes')
               .query({ access_token: token })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.mailboxes).to.be.an(Array);
            expect(res.body.mailboxes[0].name).to.be(MAILBOX_ID);
            done();
        });
    });

    it('can delete mailbox', function (done) {
        superagent.del(SERVER_URL + '/api/v1/mailboxes/' + MAILBOX_ID)
               .query({ access_token: token })
               .send({ name: MAILBOX_ID })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            done();
        });
    });

    it('cannot delete random mailbox', function (done) {
        superagent.del(SERVER_URL + '/api/v1/mailboxes/' + MAILBOX_ID)
               .query({ access_token: token })
               .send({ name: MAILBOX_ID })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(404);
            done();
        });
    });
});
