var server = require('../server'),
    request = require('superagent'),
    expect = require('expect.js');

var SERVER_URL;

before(function (done) {
    server.start(function () {
        SERVER_URL = 'http://localhost:' + server.app.get('port');
        done();
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
});
