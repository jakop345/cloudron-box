'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */

process.env.NODE_ENV = 'testing'; // ugly

var server = require('../server'),
    request = require('superagent'),
    expect = require('expect.js'),
    database = require('../database'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    os = require('os');

var SERVER_URL;
var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var AUTH = new Buffer(USERNAME + ':' + PASSWORD).toString('base64');
var TESTVOLUME = 'testvolume';

function now() { return (new Date()).getTime(); }
function tempFile(contents) {
    var file = path.join(os.tmpdir(), '' + crypto.randomBytes(4).readUInt32LE(0));
    fs.writeFileSync(file, contents);
    return file;
}

before(function (done) {
    server.start(function () {
        SERVER_URL = 'http://localhost:' + server.app.get('port');
        database.USERS_TABLE.removeAll(done);
    });
});

describe('bad requests', function () {
    it('random', function (done) {
        request.get(SERVER_URL + '/random', function (err, res) {
            expect(res.statusCode == 401).to.be.ok();
            done(err);
        });
    });
});

describe('version', function () {
    it('version', function (done) {
        request.get(SERVER_URL + '/api/v1/version', function (err, res) {
            expect(res.statusCode == 200).to.be.ok();
            expect(res.body.version == server.VERSION).to.be.ok();
            done(err);
        });
    });
});

describe('user', function () {
    it('admin', function (done) {
        request.post(SERVER_URL + '/api/v1/createadmin')
               .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
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

describe('volume', function () {
    it('create', function (done) {
        request.post(SERVER_URL + '/api/v1/volume/create')
               .set('Authorization', AUTH)
               .send({ name: TESTVOLUME })
               .end(function (err, res) {
            expect(res.statusCode == 201).to.be.ok();
            done(err);
        });
    });

    it('list', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/list')
               .set('Authorization', AUTH)
               .end(function (err, res) {
            expect(res.body.length == 1).to.be.ok();
            expect(res.body[0].name == TESTVOLUME).to.be.ok();
            expect(res.statusCode == 200).to.be.ok();
            done(err);
        });
    });

    it('listFiles', function (done) {
        request.get(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/list/')
               .set('Authorization', AUTH)
               .end(function (err, res) {
            var foundReadme = false;
            res.body.forEach(function (entry) {
                if (entry.filename == 'README.md') foundReadme = true;
            });
            expect(foundReadme === true).to.be.ok();
            done(err);
        });
    });

    it('bad volume', function (done) {
        request.get(SERVER_URL + '/api/v1/file/whatever/volume')
               .set('Authorization', AUTH)
               .end(function (err, res) {
            expect(res.statusCode == 404).to.be.ok();
            done(err);
        });
    });
});

describe('file', function () {
    it('read', function (done) {
        request.get(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/README.md')
               .set('Authorization', AUTH)
               .end(function (err, res) {
            expect(res.statusCode == 200).to.be.ok();
            expect(res.text == 'README').to.be.ok();
            done(err);
        });
    });

    var serverRevision = '', newFileSha1 = '';

    it('update - add', function (done) {
        request.post(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/NEWFILE')
               .set('Authorization', AUTH)
               .field('data', JSON.stringify({ action: 'add', lastSyncRevision: '', entry: { path: 'NEWFILE', stat: { mtime: now() } }}))
               .attach('file', tempFile('BLAH BLAH'))
               .end(function (err, res) {
            expect(res.statusCode == 201).to.be.ok();
            expect(res.body.sha1 == 'e3f27b2dbefe2f9c5efece6bdbc0f44e9fb8875a');
            newFileSha1 = res.body.sha1;
            expect(res.body.serverRevision.length !== 0).to.be.ok();
            serverRevision = res.body.serverRevision;
            expect(res.body.fastForward === false).to.be.ok();
            done(err);
        });
    });

    it('diff', function (done) {
        var index = {
            entries: [
                { path: 'NEWFILE', sha1: '', stat: { mtime: now()+10, size: 20 } } // file changed, so no sha1
            ]
        };

        request.post(SERVER_URL + '/api/v1/sync/' + TESTVOLUME + '/diff')
               .set('Authorization', AUTH)
               .send({ index: index, lastSyncRevision: serverRevision })
               .end(function (err, res) {

            expect(res.statusCode == 200).to.be.ok();
            expect(res.body.serverRevision.length !== 0).to.be.ok();
            expect(res.body.changes.length == 2);
            expect(res.body.changes[0].action == 'update');
            expect(res.body.changes[0].path == 'NEWFILE');
            expect(res.body.changes[0].conflict === false);
            expect(res.body.changes[1].action == 'remove');
            expect(res.body.changes[1].path == 'README.md');
            expect(res.body.changes[1].conflict === false);

            done(err);
        });
    });

    it('update - update', function (done) {
        request.post(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/NEWFILE')
               .set('Authorization', AUTH)
               .field('data', JSON.stringify({ action: 'update', lastSyncRevision: serverRevision, entry: { path: 'NEWFILE', stat: { mtime: now() } }}))
               .attach('file', tempFile('BLAH BLAH2'))
               .end(function (err, res) {
            expect(res.statusCode == 201).to.be.ok();
            expect(res.body.sha1 == '321f24c9a2669b35cd2df0cab5c42b2bb2958e9a');
            expect(res.body.serverRevision.length !== 0).to.be.ok();
            serverRevision = res.body.serverRevision;
            expect(res.body.fastForward === true);
            done(err);
        });
    });

    it('update - del', function (done) {
        request.post(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/NEWFILE')
               .set('Authorization', AUTH)
               .field('data', JSON.stringify({ action: 'remove', lastSyncRevision: serverRevision, entry: { path: 'NEWFILE' } }))
               .end(function (err, res) {
            expect(res.statusCode == 200).to.be.ok();
            expect(res.body.serverRevision.length !== 0).to.be.ok();
            serverRevision = res.body.serverRevision;
            expect(res.body.fastForward === true);
            done(err);
        });
    });
});

