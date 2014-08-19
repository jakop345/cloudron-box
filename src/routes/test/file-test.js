/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var Server = require('../../server.js'),
    request = require('superagent'),
    expect = require('expect.js'),
    crypto = require('crypto'),
    fs = require('fs'),
    rimraf = require('rimraf'),
    path = require('path'),
    os = require('os'),
    mkdirp = require('mkdirp'),
    uuid = require('node-uuid'),
    userdb = require('../../userdb.js'),
    Repo = require('../../repo.js'),
    config = require('../../../config.js');

var SERVER_URL = 'http://localhost:' + config.port;

var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var volume;
var server;

function setup(done) {
    server = new Server();
    server.start(function (err) {
        expect(err).to.not.be.ok();

        volume = { id: uuid.v4(), repo: null };

        var mountPoint = path.join(config.mountRoot, volume.id);
        mkdirp.sync(mountPoint);
        var tmpDir = path.join(mountPoint, 'tmp');
        mkdirp.sync(tmpDir);

        userdb.clear(function () {
            request.post(SERVER_URL + '/api/v1/createadmin')
              .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
              .end(function (error, result) {
                expect(error).to.not.be.ok();
                expect(result).to.be.ok();

                volume.repo = new Repo(path.join(mountPoint, 'repo'), tmpDir);
                volume.repo.create(USERNAME, EMAIL, function (error) {
                    if (error) return done(error);

                    volume.repo.addFileWithData('README.md', 'README', done);
                });
            });
        });
    });
}

// remove all temporary folders
function cleanup(done) {
    server.stop(function (error) {
        expect(error).to.be(null);
        rimraf(config.baseDir, done);
    });
}

function tempFile(contents) {
    var file = path.join(os.tmpdir(), '' + crypto.randomBytes(4).readUInt32LE(0));
    fs.writeFileSync(file, contents);
    return file;
}

describe('Server File API', function () {
    this.timeout(10000);

    before(setup);
    after(cleanup);

    it('read', function (done) {
        request.get(SERVER_URL + '/api/v1/file/' + volume.id + '/README.md')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.text).to.equal('README');
            done(err);
        });
    });

    var serverRevision = '', newFileRev = '';

    it('put - add', function (done) {
        request.put(SERVER_URL + '/api/v1/file/' + volume.id + '/NEWFILE')
               .auth(USERNAME, PASSWORD)
               .field('data', JSON.stringify({ parentRev: '' }))
               .attach('file', tempFile('BLAH BLAH'))
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            expect(res.body.sha1).to.equal('e3f27b2dbefe2f9c5efece6bdbc0f44e9fb8875a');
            newFileRev = res.body.sha1;
            expect(res.body.serverRevision.length).to.not.be.equal(0);
            serverRevision = res.body.serverRevision;
            done(err);
        });
    });

    it('diff', function (done) {
        var index = [
            { path: 'NEWFILE', sha1: '', mtime: Date.now()+10, size: 20 } // file changed, so no sha1
        ];

        request.post(SERVER_URL + '/api/v1/sync/' + volume.id + '/diff')
               .auth(USERNAME, PASSWORD)
               .send({ index: index, lastSyncRevision: serverRevision })
               .end(function (err, res) {

            expect(res.statusCode).to.equal(200);
            expect(res.body.serverRevision.length).to.not.be(0);
            expect(res.body.changes.length).to.equal(2);
            expect(res.body.changes[0].action).to.equal('update');
            expect(res.body.changes[0].path).to.equal('NEWFILE');
            expect(res.body.changes[0].conflict === false);
            expect(res.body.changes[1].action).to.equal('remove');
            expect(res.body.changes[1].path).to.equal('README.md');
            expect(res.body.changes[1].conflict === false);

            done(err);
        });
    });

    it('put - update', function (done) {
        request.put(SERVER_URL + '/api/v1/file/' + volume.id + '/NEWFILE')
               .auth(USERNAME, PASSWORD)
               .field('data', JSON.stringify({ parentRev: newFileRev }))
               .attach('file', tempFile('BLAH BLAH2'))
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            expect(res.body.sha1).to.equal('321f24c9a2669b35cd2df0cab5c42b2bb2958e9a');
            newFileRev = res.body.sha1;
            expect(res.body.serverRevision.length).to.not.equal(0);
            serverRevision = res.body.serverRevision;
            expect(res.body.fastForward === true);
            done(err);
        });
    });

    it('delta - virgin client', function (done) {
        request.post(SERVER_URL + '/api/v1/sync/' + volume.id + '/delta')
               .auth(USERNAME, PASSWORD)
               .query({ clientRevision: '' }) // virgin client
               .end(function (err, res) {
            expect(res.body.serverRevision).to.equal(serverRevision);
            expect(res.body.changes.length).to.equal(2);
            expect(res.body.changes[0].status).to.equal('ADDED');
            expect(res.body.changes[0].path).to.equal('NEWFILE');
            expect(res.body.changes[1].status).to.equal('ADDED');
            expect(res.body.changes[1].path).to.equal('README.md');
            done(err);
        });
    });

    it('delta - uptodate client', function (done) {
        request.post(SERVER_URL + '/api/v1/sync/' + volume.id + '/delta')
               .auth(USERNAME, PASSWORD)
               .query({ clientRevision: serverRevision }) // uptodate client
               .end(function (err, res) {
            expect(res.body.serverRevision).to.equal(serverRevision);
            expect(res.body.changes.length).to.equal(0);
            done(err);
        });
    });

    it('delta - invalid cursor', function (done) {
        request.post(SERVER_URL + '/api/v1/sync/' + volume.id + '/delta')
               .auth(USERNAME, PASSWORD)
               .query({ clientRevision: 'cottoneyedjoe' })
               .end(function (err, res) {
            expect(res.status).to.equal(422);
            done(err);
        });
    });

    it('revisions', function (done) {
        request.get(SERVER_URL + '/api/v1/revisions/' + volume.id + '/NEWFILE')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.revisions.length).to.be(2);
            expect(res.body.revisions[0].sha1).to.equal('321f24c9a2669b35cd2df0cab5c42b2bb2958e9a');
            expect(res.body.revisions[0].size).to.equal(10);
            expect(res.body.revisions[0].author.email).to.equal(EMAIL);
            expect(res.body.revisions[0].author.name).to.equal(USERNAME);
            expect(res.body.revisions[1].sha1).to.equal('e3f27b2dbefe2f9c5efece6bdbc0f44e9fb8875a');
            expect(res.body.revisions[1].size).to.equal(9);
            expect(res.body.revisions[1].author.email).to.equal(EMAIL);
            expect(res.body.revisions[1].author.name).to.equal(USERNAME);
            done(err);
        });
    });

    var treeHash;

    it('metadata - root, no rev', function (done) {
        request.get(SERVER_URL + '/api/v1/metadata/' + volume.id + '/')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.entries.length).to.be(2);
            expect(res.body.entries[0].path).to.equal('NEWFILE');
            expect(res.body.entries[0].mtime).to.be.a('number');
            expect(res.body.entries[0].size).to.be('BLAH BLAH2'.length);
            expect(res.body.entries[1].path).to.equal('README.md');
            expect(res.body.entries[1].mtime).to.be.a('number');

            treeHash = res.body.hash;

            done(err);
        });
    });

    it('metadata - root, no rev, hash', function (done) {
        request.get(SERVER_URL + '/api/v1/metadata/' + volume.id + '/')
               .auth(USERNAME, PASSWORD)
               .query({ hash: treeHash })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(304); // unchanged

            done(err);
        });
    });

    it('metadata - file, no rev', function (done) {
        request.get(SERVER_URL + '/api/v1/metadata/' + volume.id + '/NEWFILE')
               .auth(USERNAME, PASSWORD)
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.entries.length).to.be(1);
            expect(res.body.entries[0].path).to.equal('NEWFILE');
            expect(res.body.entries[0].mtime).to.be.a('number');
            expect(res.body.entries[0].size).to.be('BLAH BLAH2'.length);

            expect(res.body.hash).to.equal('321f24c9a2669b35cd2df0cab5c42b2bb2958e9a'); // same as file rev
            done(err);
        });
    });

    it('metadata - file, rev', function (done) {
        request.get(SERVER_URL + '/api/v1/metadata/' + volume.id + '/NEWFILE')
               .auth(USERNAME, PASSWORD)
               .query({ rev: 'HEAD'})
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.entries.length).to.be(1);
            expect(res.body.entries[0].path).to.equal('NEWFILE');
            expect(res.body.entries[0].mtime).to.be(undefined);
            expect(res.body.entries[0].size).to.be('BLAH BLAH2'.length);

            expect(res.body.hash).to.be(undefined); // metadata with rev never changes, so hash makes no sense
            done(err);
        });
    });

    it('copy', function (done) {
        request.post(SERVER_URL + '/api/v1/fileops/' + volume.id + '/copy')
               .auth(USERNAME, PASSWORD)
               .send({ from_path: 'README.md', to_path: 'README.md.copy', rev: '*' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.path).to.equal('README.md.copy');
            expect(res.body.sha1).to.equal('100b93820ade4c16225673b4ca62bb3ade63c313');
            done(err);
        });
    });

    it('move', function (done) {
        request.post(SERVER_URL + '/api/v1/fileops/' + volume.id + '/move')
               .auth(USERNAME, PASSWORD)
               .send({ from_path: 'README.md.copy', to_path: 'README.md.move', rev: '100b93820ade4c16225673b4ca62bb3ade63c313' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.path).to.equal('README.md.move');
            expect(res.body.sha1).to.equal('100b93820ade4c16225673b4ca62bb3ade63c313');
            done(err);
        });
    });

    it('delete - no revision', function (done) {
        request.post(SERVER_URL + '/api/v1/fileops/' + volume.id + '/delete')
               .auth(USERNAME, PASSWORD)
               .send({ path: 'README.md' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(400);
            done(err);
        });
    });

    it('delete - wildcard revision', function (done) {
        request.post(SERVER_URL + '/api/v1/fileops/' + volume.id + '/delete')
               .auth(USERNAME, PASSWORD)
               .send({ path: 'README.md', rev: '*' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.sha1).to.equal('100b93820ade4c16225673b4ca62bb3ade63c313');
            done(err);
        });
    });

    it('delete - non-wildcard revision', function (done) {
        request.post(SERVER_URL + '/api/v1/fileops/' + volume.id + '/delete')
               .auth(USERNAME, PASSWORD)
               .send({ path: 'NEWFILE', rev: newFileRev })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(200);
            expect(res.body.serverRevision.length).to.not.equal(0);
            serverRevision = res.body.serverRevision;
            done(err);
        });
    });

    it('delete - non-existent path', function (done) {
        request.post(SERVER_URL + '/api/v1/fileops/' + volume.id + '/delete')
               .auth(USERNAME, PASSWORD)
               .send({ path: '/this/doesnt/exist', rev: '*' })
               .end(function (err, res) {
            expect(res.statusCode).to.equal(204);
            expect(res.body).to.be.empty();
            done(err);
        });
    });

    var fileRevision;
    it('put - file initial revision', function (done) {
        request.put(SERVER_URL + '/api/v1/file/' + volume.id + '/newt')
               .auth(USERNAME, PASSWORD)
               .field('data', JSON.stringify({ }))
               .attach('file', tempFile('BLAH BLAH'))
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            expect(res.body.sha1).to.equal('e3f27b2dbefe2f9c5efece6bdbc0f44e9fb8875a');
            fileRevision = res.body.sha1;
            expect(res.body.path).to.equal('newt');
            expect(res.body.serverRevision.length).to.not.be(0);
            done(err);
        });
    });

    it('put - file new revision', function (done) {
        request.put(SERVER_URL + '/api/v1/file/' + volume.id + '/newt')
               .auth(USERNAME, PASSWORD)
               .field('data', JSON.stringify({ parentRev: fileRevision, overwrite: false}))
               .attach('file', tempFile('BLAH BLAH2'))
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            expect(res.body.sha1).to.equal('321f24c9a2669b35cd2df0cab5c42b2bb2958e9a');
            expect(res.body.path).to.equal('newt');
            expect(res.body.serverRevision.length).to.not.be(0);
            done(err);
        });
    });

    it('put - file conflict', function (done) {
        request.put(SERVER_URL + '/api/v1/file/' + volume.id + '/newt')
               .auth(USERNAME, PASSWORD)
               .field('data', JSON.stringify({ parentRev: fileRevision, overwrite: false })) // old revision, so conflict
               .attach('file', tempFile('BLAH BLAH3'))
               .end(function (err, res) {
            expect(res.statusCode).to.equal(201);
            expect(res.body.sha1).to.equal('fc0443d1b179974e052f5c8982f6adb41edbaf57');
            expect(res.body.path).to.equal('newt-ConflictedCopy');
            expect(res.body.serverRevision.length).to.not.be(0);
            done(err);
        });
    });
});
