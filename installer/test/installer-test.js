/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

function cleanup(done) {
    done();
}

describe('Server', function () {
    this.timeout(5000);

    after(cleanup);

/*
    describe('restore', function () {
        var server;

        before(function (done) {
            server = new Server();
            server.start(done);
        });

        after(function (done) {
            server.stop(function () {
                done();
            });
        });

        it('fails due to missing token', function (done) {
            var data = {
                restoreUrl: 'somes3url',
            };
            request.post(SERVER_URL + '/api/v1/restore').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });

        it('fails due to missing restoreUrl', function (done) {
            var data = {
                token: 'boxtoken'
            };
            request.post(SERVER_URL + '/api/v1/restore').send(data).end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result.statusCode).to.equal(400);
                done();
            });
        });
    });

    describe('announce', function () {
        var server, failingGet;

        before(function (done) {
            process.env.ANNOUNCE_INTERVAL = 20;

            config.set('token', null);
            server = new Server();
            server.start(done);

            var scope = nock(config.appServerUrl());
            failingGet = scope.get('/api/v1/boxes/' + config.fqdn() + '/announce');
            failingGet.times(5).reply(502);
        });

        after(function (done) {
            process.env.ANNOUNCE_INTERVAL = 60000;
            server.stop(done);
            nock.cleanAll();
        });

        it('sends announce request repeatedly until token is set', function (done) {
            setTimeout(function () {
                expect(cloudron._getAnnounceTimerId()).to.be.ok();
                expect(failingGet.counter).to.be.below(6); // counter is nock internal

                config.set('token', 'provision');

                setTimeout(function () {
                    expect(cloudron._getAnnounceTimerId()).to.be(null);
                    done();
                }, 100);
            }, 100);
        });
    });


*/
});

