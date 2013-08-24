var server = require('../server'),
    request = require('superagent'),
    expect = require('expect.js'),
    database = require('../database');

var SERVER_URL;
var USERNAME = 'admin', PASSWORD = 'admin';
var AUTH = new Buffer(USERNAME + ':' + PASSWORD).toString('base64');

before(function (done) {
    server.start(function () {
        SERVER_URL = 'http://localhost:' + server.app.get('port');
        database.USERS_TABLE.removeAll(done);
    });
});

describe('api', function () {
    it('random', function (done) {
        request.get(SERVER_URL + '/random', function (err, res) {
            expect(res.statusCode == 401).to.be.ok();
            done(err);
        });
    });

    it('version', function (done) {
        request.get(SERVER_URL + '/api/v1/version', function (err, res) {
            expect(res.statusCode == 200).to.be.ok();
            expect(res.body.version == server.VERSION).to.be.ok();
            done(err);
        });
    });

    it('admin', function (done) {
        request.post(SERVER_URL + '/api/v1/createadmin')
               .send({ username: USERNAME, password: PASSWORD, email: 'silly@me.com' })
               .end(function (err, res) {
            expect(res.statusCode == 202).to.be.ok();
            done(err);
        });
    });

    it('userInfo', function (done) {
        request.get(SERVER_URL + '/api/v1/userInfo')
               .set('Authorization', AUTH)
               .end(function (err, res) {
            expect(res.statusCode == 200).to.be.ok();
            expect(res.body.username == 'admin');
            done(err);
        });
    });
});
