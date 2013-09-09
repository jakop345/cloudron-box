'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var Repo = require('../repo'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    rimraf = require('rimraf'),
    assert = require('assert'),
    expect = require('expect.js'),
    constants = require('constants');

var EMAIL = 'no@bo.dy';
var USERNAME = 'nobody';

var tmpdirname = 'repo-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.join(os.tmpdir(), tmpdirname);
var repo = new Repo({ rootDir: tmpdir });

function cleanup(done) {
    rimraf(tmpdir, function (error) {
        done();
    });
}

describe('Repo', function () {
    after(cleanup);

    it('create', function (done) {
        repo.create({ username: USERNAME, email: EMAIL }, function () {
            expect(fs.existsSync(repo.gitDir)).to.be.ok();
            done();
        });
    });

    it('addFile', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_NEW_CONTENTS');
        repo.addFile('README', { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add README');
            expect(fileInfo.sha1).to.equal('2180e82647ff9a3e1a93ab43b81c82025c33c6e2');
            expect(commit.author.name).to.equal(USERNAME);
            expect(commit.author.email).to.equal(EMAIL);
            done();
        });
    });

    it('addFile - conflict', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_NEW_CONTENTS');
        repo.addFile('README', { file: tmpfile, renamePattern: 'ConflictedCopy' }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add README-ConflictedCopy');
            expect(fileInfo.sha1).to.equal('2180e82647ff9a3e1a93ab43b81c82025c33c6e2');
            expect(commit.author.name).to.equal(USERNAME);
            expect(commit.author.email).to.equal(EMAIL);
            done();
        });
    });

    it('copyFile', function (done) {
        repo.copyFile('README', 'README.copy', function (err, fileInfo, commit) {
            expect(fileInfo.path).to.equal('README.copy');
            expect(commit.subject).to.equal('Copy from README to README.copy');
            done();
        });
    });

    it('moveFile', function (done) {
        repo.moveFile('README.copy', 'README.move', function (err, fileInfo, commit) {
            expect(fileInfo.path).to.equal('README.move');
            expect(commit.subject).to.equal('Move from README.copy to README.move');
            done();
        });
    });

    it('createReadStream - valid file', function (done) {
        var readme = repo.createReadStream('README');
        var data = '';
        readme.on('data', function (d) { data += d; });
        readme.on('end', function () {
            expect(data).to.equal('README_NEW_CONTENTS');
            done();
        });
    });

    it('createReadStream - invalid file', function (done) {
        var readme = repo.createReadStream('RANDOM');
        readme.on('error', function () { done(); });
    });

    it('createReadStream - invalid path', function (done) {
        var readme = repo.createReadStream('../README');
        readme.on('error', function (err) {
            expect(err.code).to.equal('ENOENT');
            done();
        });
    });

    it('createReadStream @rev', function (done) {
        var readme = repo.createReadStream('README', { rev: '2180e82647' });
        var data = '';
        readme.on('data', function (d) { data += d; });
        readme.on('end', function () {
            expect(data).to.equal('README_NEW_CONTENTS');
            done();
        });
    });

    it('createReadStream @bad_rev', function (done) {
        var readme = repo.createReadStream('README', { rev: '123457' });
        readme.on('error', function (err) {
            expect(err).to.be.ok();
            done();
        });
    });


    it('tracked', function (done) {
        repo.isTracked('README', function (err, tracked) {
            expect(tracked).to.be.ok();
            done();
        });
    });

    it('!tracked', function (done) {
        repo.isTracked('RANDOM', function (err, tracked) {
            expect(!tracked).to.be.ok();
            done();
        });
    });

    it('getTree - valid tree', function (done) {
        repo.getTree('HEAD', function (err, tree) {
            expect(tree.entries.length).to.equal(3);
            expect(tree.entries[0].path).to.equal('README');
            done();
        });
    });

    it('getTree - null tree', function (done) {
        repo.getTree('', function (err, tree) {
            expect(tree.entries.length).to.equal(0);
            done();
        });
    });

    it('updateFile', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_UPDATED_CONTENTS');
        repo.updateFile('README', { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Update README');
            expect(fileInfo.sha1).to.equal('39b8a10eed1304c9e779bae47ce4cb60a9b9b9bb');
            done();
        });
    });

    it('fileEntry - valid file @HEAD', function (done) {
        repo.fileEntry('README', 'HEAD', function (err, entry) {
            expect(entry.size).to.equal('README_UPDATED_CONTENTS'.length);
            expect(entry.mtime).to.not.equal(0);
            done();
        });
    });

    it('fileEntry - valid file @HEAD~1', function (done) {
        repo.fileEntry('README', 'HEAD~1', function (err, entry) {
            expect(entry.size).to.equal('README_NEW_CONTENTS'.length);
            expect(entry.mtime).to.not.equal(0);
            done();
        });
    });

    it('fileEntry - valid dir @HEAD', function (done) {
        repo.fileEntry('/', 'HEAD', function (err, entry) {
            expect(entry.path).to.equal('/');
            expect(entry.sha1).to.be.ok();
            expect(entry.mode & constants.S_IFMT).to.be(constants.S_IFDIR);
            expect(entry.size).to.equal(0);
            expect(entry.mtime).to.be(undefined);
            done();
        });
    });


    it('fileEntry - invalid file @HEAD', function (done) {
        repo.fileEntry('RANDOM', 'HEAD', function (err, entry) {
            expect(err).to.equal(null);
            expect(entry).to.equal(null);
            done();
        });
    });

    it('diffTree - empty tree', function (done) {
        repo.diffTree('', 'HEAD', function (err, changes) {
            expect(changes.length).to.equal(3);
            expect(changes[0].path).to.equal('README');
            expect(changes[0].status).to.equal('ADDED');
            done(err);
        });
    });

    it('getRevisions', function (done) {
        repo.getRevisions('README', function (err, revisions) {
            expect(err).to.equal(null);
            expect(revisions.length).to.equal(2);
            expect(revisions[0].path).to.equal('README');
            expect(revisions[0].subject).to.equal('Update README');
            expect(revisions[0].size).to.equal(23);

            expect(revisions[1].path).to.equal('README');
            expect(revisions[1].subject).to.equal('Add README');
            expect(revisions[1].size).to.equal(19);
            done();
        });
    });

    it('index', function (done) {
        repo.indexEntries(function (err, entries) {
            expect(entries.length).to.equal(3);
            expect(entries[0].size).to.equal('README_UPDATED_CONTENTS'.length);
            expect(entries[0].mtime).to.not.equal(0);
            done(err);
        });
    });

    it('removeFile - valid file', function (done) {
        repo.removeFile('README', function (err, commit) {
            expect(commit.subject).to.equal('Remove README');
            done();
        });
    });

    it('removeFile - invalid path', function (done) {
        repo.removeFile('../README', function (err, commit) {
            expect(err.code).to.equal('ENOENT');
            done();
        });
    });

    it('diffTree - removed file', function (done) {
        repo.diffTree('HEAD~1', 'HEAD', function (err, changes) {
            expect(changes.length).to.equal(1);
            expect(changes[0].path).to.equal('README');
            expect(changes[0].status).to.equal('DELETED');
            expect(changes[0].mode).to.equal(0);
            expect(changes[0].rev).to.equal('0000000000000000000000000000000000000000');
            done(err);
        });
    });

    it('fileEntry - removed file @HEAD', function (done) {
        repo.fileEntry('README', 'HEAD', function (err, entry) {
            expect(err).to.be(null);
            expect(entry).to.be(null);
            done();
        });
    });

    it('removeFile - invalid file', function (done) {
        repo.removeFile('RANDOM', function (err, commit) {
            expect(err).to.not.be(null);
            expect(commit).to.be(undefined);
            done();
        });
    });
});

