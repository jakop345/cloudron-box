'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

process.env.NODE_ENV = 'testing'; // ugly

var server = require('../../server.js'),
    request = require('superagent'),
    expect = require('expect.js'),
    database = require('../database.js'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    os = require('os');

var SERVER_URL;
var USERNAME = 'admin', PASSWORD = 'admin', EMAIL ='silly@me.com';
var USERNAME_2 = 'user', PASSWORD_2 = 'userpassword', EMAIL_2 = 'user@foo.bar';
var USERNAME_3 = 'userTheThird', PASSWORD_3 = 'userpassword333', EMAIL_3 = 'user3@foo.bar';
var TESTVOLUME = 'testvolume';

function now() { return (new Date()).getTime(); }
function tempFile(contents) {
    var file = path.join(os.tmpdir(), '' + crypto.randomBytes(4).readUInt32LE(0));
    fs.writeFileSync(file, contents);
    return file;
}

describe('Server API', function () {
    this.timeout(5000);

    before(function (done) {
        server.start(function (err, app) {
            SERVER_URL = 'http://localhost:' + app.get('port');
            database.USERS_TABLE.removeAll(done);
        });
    });

    describe('bad requests', function () {
        it('random', function (done) {
            request.get(SERVER_URL + '/random', function (err, res) {
                expect(res.statusCode).to.equal(401);
                done(err);
            });
        });
    });

    describe('version', function () {
        it('version', function (done) {
            request.get(SERVER_URL + '/api/v1/version', function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.version).to.equal(require('../../package.json').version);
                done(err);
            });
        });
    });

    describe('user', function () {
        it('create admin', function (done) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(202);
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

        it('create second admin should fail', function (done) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                   .send({ username: USERNAME_2, password: PASSWORD, email: EMAIL })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(404);
                done(err);
            });
        });

        it('create second and third user as admin', function (done) {
            request.post(SERVER_URL + '/api/v1/user/create')
                   .auth(USERNAME, PASSWORD)
                   .send({ username: USERNAME_2, password: PASSWORD_2, email: EMAIL_2 })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(202);

                request.post(SERVER_URL + '/api/v1/user/create')
                       .auth(USERNAME, PASSWORD)
                       .send({ username: USERNAME_3, password: PASSWORD_3, email: EMAIL_3 })
                       .end(function (err, res) {
                    expect(res.statusCode).to.equal(202);
                    done(err);
                });
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

    describe('volume', function () {
        before(function (done) {
            request.post(SERVER_URL + '/api/v1/createadmin')
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (err, res) {
                done(err);
            });
        });

        after(function (done) {
            request.post(SERVER_URL + '/api/v1/user/remove')
                   .auth(USERNAME, PASSWORD)
                   .send({ username: USERNAME })
                   .end(function (err, res) {
                done(err);
            });
        });

        it('create', function (done) {
            this.timeout(5000); // on the Mac, creating volumes takes a lot of time on low battery
            request.post(SERVER_URL + '/api/v1/volume/create')
                   .auth(USERNAME, PASSWORD)
                   .send({ name: TESTVOLUME })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                done(err);
            });
        });

        it('list', function (done) {
            request.get(SERVER_URL + '/api/v1/volume/list')
                   .auth(USERNAME, PASSWORD)
                   .end(function (err, res) {
                expect(res.body.length).to.equal(1);
                expect(res.body[0].name).to.equal(TESTVOLUME);
                expect(res.statusCode).to.equal(200);
                done(err);
            });
        });

        it('listFiles', function (done) {
            request.get(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/list/')
                   .auth(USERNAME, PASSWORD)
                   .end(function (err, res) {
                var foundReadme = false;
                res.body.forEach(function (entry) {
                    expect(entry.filename).to.be.a("string");
                    expect(entry.stat).to.be.an("object");
                    expect(entry.stat.size).to.be.a("number");

                    if (entry.filename === 'README.md') foundReadme = true;
                });
                expect(foundReadme).to.be(true);
                done(err);
            });
        });

        it('destroy', function(done) {
            request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/delete')
                   .auth(USERNAME, PASSWORD)
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                done(err);
            });
        });

        it('bad volume', function (done) {
            request.get(SERVER_URL + '/api/v1/file/whatever/volume')
                   .auth(USERNAME, PASSWORD)
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(404);
                done(err);
            });
        });
    });

    describe('file', function () {
        before(function(done) {
            this.timeout(5000); // on the Mac, creating volumes takes a lot of time on low battery
            request.post(SERVER_URL + '/api/v1/createadmin')
                   .send({ username: USERNAME, password: PASSWORD, email: EMAIL })
                   .end(function (err, res) {
                request.post(SERVER_URL + '/api/v1/volume/create')
                       .auth(USERNAME, PASSWORD)
                       .send({ name: TESTVOLUME })
                       .end(function (err, res) {
                    done(err);
                });
            });
        });

        after(function(done) {
            request.post(SERVER_URL + '/api/v1/volume/' + TESTVOLUME + '/delete')
                   .auth(USERNAME, PASSWORD)
                   .end(function (err, res) {
                request.post(SERVER_URL + '/api/v1/user/remove')
                       .auth(USERNAME, PASSWORD)
                       .send({ username: USERNAME })
                       .end(function (err, res) {
                    done(err);
                });
            });
        });

        it('read', function (done) {
            request.get(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/README.md')
                   .auth(USERNAME, PASSWORD)
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.text).to.equal('README');
                done(err);
            });
        });

        var serverRevision = '', newFileSha1 = '';

        it('update - add', function (done) {
            request.post(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/NEWFILE')
                   .auth(USERNAME, PASSWORD)
                   .field('data', JSON.stringify({ action: 'add', lastSyncRevision: '', entry: { path: 'NEWFILE', mtime: now() } }))
                   .attach('file', tempFile('BLAH BLAH'))
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                expect(res.body.sha1).to.equal('e3f27b2dbefe2f9c5efece6bdbc0f44e9fb8875a');
                newFileSha1 = res.body.sha1;
                expect(res.body.serverRevision.length).to.not.be.equal(0);
                serverRevision = res.body.serverRevision;
                expect(res.body.fastForward).to.be(false);
                done(err);
            });
        });

        it('diff', function (done) {
            var index = [
                { path: 'NEWFILE', sha1: '', mtime: now()+10, size: 20 } // file changed, so no sha1
            ];

            request.post(SERVER_URL + '/api/v1/sync/' + TESTVOLUME + '/diff')
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

        it('update - update', function (done) {
            request.post(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/NEWFILE')
                   .auth(USERNAME, PASSWORD)
                   .field('data', JSON.stringify({ action: 'update', lastSyncRevision: serverRevision, entry: { path: 'NEWFILE', mtime: now() }}))
                   .attach('file', tempFile('BLAH BLAH2'))
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(201);
                expect(res.body.sha1).to.equal('321f24c9a2669b35cd2df0cab5c42b2bb2958e9a');
                expect(res.body.serverRevision.length).to.not.equal(0);
                serverRevision = res.body.serverRevision;
                expect(res.body.fastForward === true);
                done(err);
            });
        });

        it('delta', function (done) {
            request.post(SERVER_URL + '/api/v1/sync/' + TESTVOLUME + '/delta')
                   .auth(USERNAME, PASSWORD)
                   .send({ clientRevision: '' }) // virgin client
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

        it('delta', function (done) {
            request.post(SERVER_URL + '/api/v1/sync/' + TESTVOLUME + '/delta')
                   .auth(USERNAME, PASSWORD)
                   .query({ clientRevision: serverRevision }) // uptodate client
                   .send() // for POST, send calls query to get query params
                   .end(function (err, res) {
                expect(res.body.serverRevision).to.equal(serverRevision);
                expect(res.body.changes.length).to.equal(0);
                done(err);
            });
        });

        it('revisions', function (done) {
            request.get(SERVER_URL + '/api/v1/revisions/' + TESTVOLUME + '/NEWFILE')
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
            request.get(SERVER_URL + '/api/v1/metadata/' + TESTVOLUME + '/')
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
            request.get(SERVER_URL + '/api/v1/metadata/' + TESTVOLUME + '/')
                   .auth(USERNAME, PASSWORD)
                   .query({ hash: treeHash })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(304); // unchanged

                done(err);
            });
        });

        it('metadata - file, no rev', function (done) {
            request.get(SERVER_URL + '/api/v1/metadata/' + TESTVOLUME + '/NEWFILE')
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
            request.get(SERVER_URL + '/api/v1/metadata/' + TESTVOLUME + '/NEWFILE')
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
            request.post(SERVER_URL + '/api/v1/fileops/' + TESTVOLUME + '/copy')
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
            request.post(SERVER_URL + '/api/v1/fileops/' + TESTVOLUME + '/move')
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
            request.post(SERVER_URL + '/api/v1/fileops/' + TESTVOLUME + '/delete')
                   .auth(USERNAME, PASSWORD)
                   .send({ path: 'README.md' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(400);
                done(err);
            });
        });

        it('delete - wildcard revision', function (done) {
            request.post(SERVER_URL + '/api/v1/fileops/' + TESTVOLUME + '/delete')
                   .auth(USERNAME, PASSWORD)
                   .send({ path: 'README.md', rev: '*' })
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.sha1).to.equal('100b93820ade4c16225673b4ca62bb3ade63c313');
                done(err);
            });
        });

        it('update - del', function (done) {
            request.post(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/NEWFILE')
                   .auth(USERNAME, PASSWORD)
                   .field('data', JSON.stringify({ action: 'remove', lastSyncRevision: serverRevision, entry: { path: 'NEWFILE' } }))
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.serverRevision.length).to.not.equal(0);
                serverRevision = res.body.serverRevision;
                expect(res.body.fastForward === true);
                done(err);
            });
        });

        var fileRevision;
        it('put - file initial revision', function (done) {
            request.put(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/newt')
                   .auth(USERNAME, PASSWORD)
                   .field('data', JSON.stringify({ }))
                   .attach('file', tempFile('BLAH BLAH'))
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.sha1).to.equal('e3f27b2dbefe2f9c5efece6bdbc0f44e9fb8875a');
                fileRevision = res.body.sha1;
                expect(res.body.path).to.equal('newt');
                expect(res.body.serverRevision.length).to.not.be(0);
                done(err);
            });
        });

        it('put - file new revision', function (done) {
            request.put(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/newt')
                   .auth(USERNAME, PASSWORD)
                   .field('data', JSON.stringify({ parentRev: fileRevision, overwrite: false}))
                   .attach('file', tempFile('BLAH BLAH2'))
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.sha1).to.equal('321f24c9a2669b35cd2df0cab5c42b2bb2958e9a');
                expect(res.body.path).to.equal('newt');
                expect(res.body.serverRevision.length).to.not.be(0);
                done(err);
            });
        });

        it('put - file conflict', function (done) {
            request.put(SERVER_URL + '/api/v1/file/' + TESTVOLUME + '/newt')
                   .auth(USERNAME, PASSWORD)
                   .field('data', JSON.stringify({ parentRev: fileRevision, overwrite: false })) // old revision, so conflict
                   .attach('file', tempFile('BLAH BLAH3'))
                   .end(function (err, res) {
                expect(res.statusCode).to.equal(200);
                expect(res.body.sha1).to.equal('fc0443d1b179974e052f5c8982f6adb41edbaf57');
                expect(res.body.path).to.equal('newt-ConflictedCopy');
                expect(res.body.serverRevision.length).to.not.be(0);
                done(err);
            });
        });
    });
});
