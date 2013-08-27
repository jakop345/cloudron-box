'use strict';

/* global it:false */
/* global describe:false */

var Repo = require('../repo'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    os = require('os');

var assert = require('assert');
var expect = require('expect.js');

var EMAIL = 'no@bo.dy';
var USERNAME = 'nobody';

var tmpdirname = 'repo-test-' + crypto.randomBytes(4).readUInt32LE(0);

var repo = new Repo({ rootDir: path.join(os.tmpdir(), tmpdirname) });

console.log('repo test dir', repo.checkoutDir);

describe('create', function () {
    it('create', function (done) {
        repo.create({ name: USERNAME, email: EMAIL }, function () {
            expect(fs.existsSync(repo.gitDir)).to.be.ok();
            done();
        });
    });

    it('addFile', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_NEW_CONTENTS');
        repo.addFile('README', { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject == 'Add README').to.be.ok();
            expect(fileInfo.sha1 == '2180e82647ff9a3e1a93ab43b81c82025c33c6e2').to.be.ok();
            expect(commit.author.name == USERNAME).to.be.ok();
            expect(commit.author.email == EMAIL).to.be.ok();
            done();
        });
    });

    it('createReadStream - valid file', function (done) {
        var readme = repo.createReadStream('README');
        var data = '';
        readme.on('data', function (d) { data += d; });
        readme.on('end', function () {
            expect(data == 'README_NEW_CONTENTS').to.be.ok();
            done();
        });
    });

    it('createReadStream - invalid file', function (done) {
        var readme = repo.createReadStream('RANDOM');
        readme.on('error', function () { done(); });
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
            expect(tree.entries.length == 1).to.be.ok();
            expect(tree.entries[0].path == 'README');
            done();
        });
    });

    it('getTree - null tree', function (done) {
        repo.getTree('', function (err, tree) {
            expect(tree.entries.length === 0).to.be.ok();
            done();
        });
    });

    it('updateFile', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_UPDATED_CONTENTS');
        repo.updateFile('README', { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject == 'Update README').to.be.ok();
            expect(fileInfo.sha1 == '39b8a10eed1304c9e779bae47ce4cb60a9b9b9bb').to.be.ok();
            done();
        });
    });

    it('fileEntry - valid file @HEAD', function (done) {
        repo.fileEntry('README', 'HEAD', function (err, entry) {
            expect(entry.size == 'README_UPDATED_CONTENTS'.length).to.be.ok();
            expect(entry.mtime != 0).to.be.ok();
            done();
        });
    });

    it('fileEntry - valid file @HEAD~1', function (done) {
        repo.fileEntry('README', 'HEAD~1', function (err, entry) {
            expect(entry.size == 'README_NEW_CONTENTS'.length).to.be.ok();
            expect(entry.mtime != 0).to.be.ok();
            done();
        });
    });

    it('fileEntry - invalid file @HEAD', function (done) {
        repo.fileEntry('RANDOM', 'HEAD', function (err, entry) {
            expect(!err).to.be.ok();
            expect(entry == null).to.be.ok();
            done();
        });
    });

    it('index', function (done) {
        repo.indexEntries(function (err, entries) {
            expect(entries.length == 1).to.be.ok();
            expect(entries[0].size == 'README_UPDATED_CONTENTS'.length).to.be.ok();
            expect(entries[0].mtime != 0).to.be.ok();
            done(err);
        });
    });

    it('removeFile - valid file', function (done) {
        repo.removeFile('README', function (err, commit) {
            expect(commit.subject == 'Remove README').to.be.ok();
            done();
        });
    });

    it('fileEntry - removed file @HEAD', function (done) {
        repo.fileEntry('README', 'HEAD', function (err, entry) {
            expect(!err).to.be.ok();
            expect(entry == null).to.be.ok();
            done();
        });
    });

    it('removeFile - invalid file', function (done) {
        repo.removeFile('RANDOM', function (err, commit) {
            expect(err && !commit).to.be.ok();
            done();
        });
    });
});

