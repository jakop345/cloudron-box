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

var tmpdirname = 'repo-test-' + crypto.randomBytes(4).readUInt32LE(0);

var repo = new Repo({ root: path.join(os.tmpdir(), tmpdirname) });

console.log('repo test dir', repo.checkoutDir);

describe('create', function () {
    it('initialize should not err on non-git dir', function (done) {
        repo.initialize(done);
    });

    it('create', function (done) {
        repo.create({ name: 'nobody', email: 'no@bo.dy' }, function () {
            expect(fs.existsSync(repo.gitDir)).to.be.ok();
            done();
        });
    });

    it('addFile', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_NEW_CONTENTS');
        repo.addFile('README', { file: tmpfile }, function (err, commit) {
            expect(commit.subject == 'Add README').to.be.ok();
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
            expect(tree.entries.length == 0).to.be.ok();
            done();
        });
    });

    it('updateFile', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_UPDATED_CONTENTS');
        repo.updateFile('README', { file: tmpfile }, function (err, commit) {
            expect(commit.subject == 'Update README').to.be.ok();
            done();
        });
    });

    it('fileEntry', function (done) {
        repo.fileEntry('README', function (err, entry) {
            expect(entry.stat.size == 'README_UPDATED_CONTENTS'.length).to.be.ok();
            expect(entry.stat.mtime instanceof Date ).to.be.ok();
            done();
        });
    });

    it('removeFile - valid file', function (done) {
        repo.removeFile('README', function (err, commit) {
            expect(commit.subject == 'Remove README').to.be.ok();
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

