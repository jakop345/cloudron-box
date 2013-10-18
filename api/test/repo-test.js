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
// \u00A3 - pound, \u20AC - euro
var SPECIAL_FILE = 'SPECIAL \t~`!@#$%^&*()_+-=[]{}|,.<>?\u00A3\u20AC';

var tmpdirname = 'repo-test-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.join(os.tmpdir(), tmpdirname);
var rootdirname = 'repo-test-' + crypto.randomBytes(4).readUInt32LE(0);
var rootdir = path.join(os.tmpdir(), rootdirname);
var repo = new Repo(rootdir, tmpdir);

function cleanup(done) {
    rimraf(tmpdir, function (error) {
        rimraf(tmpdir, function (error) {
            done();
        });
    });
}

describe('Repo', function () {
    after(cleanup);

    it('create', function (done) {
        repo.create(USERNAME, EMAIL, function () {
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

    it('addFile - again', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'README_NEW_CONTENTS');
        repo.addFile('README2', { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add README2');
            expect(fileInfo.sha1).to.equal('2180e82647ff9a3e1a93ab43b81c82025c33c6e2');
            expect(commit.author.name).to.equal(USERNAME);
            expect(commit.author.email).to.equal(EMAIL);
            done();
        });
    });

    it('addFile - special chars', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'README');
        fs.writeFileSync(tmpfile, 'SPECIAL');
        repo.addFile(SPECIAL_FILE, { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add ' + SPECIAL_FILE);
            expect(fileInfo.sha1).to.equal('47a3659e3583447f22c1abaced92065056baf177');
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
            expect(tree.entries.length).to.greaterThan(3);
            var paths = tree.entries.map(function (entry) { return entry.path; });
            expect(paths).to.contain('README');
            expect(paths).to.contain(SPECIAL_FILE);
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
            expect(err.code).to.equal('ENOENT');
            expect(entry).to.be(undefined);
            done();
        });
    });

    it('diffTree - empty tree', function (done) {
        repo.diffTree('', 'HEAD', function (err, changes) {
            expect(changes.length).to.be.greaterThan(3);
            var paths = changes.map(function (change) { return change.path; });

            expect(changes[0].path).to.equal('README');
            expect(changes[0].status).to.equal('ADDED');

            expect(paths).to.contain(SPECIAL_FILE);

            done(err);
        });
    });

    it('getRevisions - README', function (done) {
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

    it('getRevisions - SPECIAL_FILE', function (done) {
        repo.getRevisions(SPECIAL_FILE, function (err, revisions) {
            expect(err).to.equal(null);
            expect(revisions.length).to.equal(1);
            expect(revisions[0].path).to.equal(SPECIAL_FILE);
            expect(revisions[0].subject).to.equal('Add ' + SPECIAL_FILE);
            expect(revisions[0].size).to.equal('SPECIAL'.length);

            done();
        });
    });

    it('index', function (done) {
        repo.indexEntries(function (err, entries) {
            expect(entries.length).to.be.greaterThan(3);

            expect(entries[0].size).to.equal('README_UPDATED_CONTENTS'.length);
            expect(entries[0].mtime).to.not.equal(0);

            var paths = entries.map(function (entry) { return entry.path; });
            expect(paths).to.contain(SPECIAL_FILE);

            done(err);
        });
    });

    it('removeFile - valid file', function (done) {
        repo.removeFile('README', function (err, entry, commit) {
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
            expect(err.code).to.be('ENOENT');
            expect(entry).to.be(undefined);
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

    it('putFile - invalid file', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'NEWFILE');
        fs.writeFileSync(tmpfile, 'NEWFILE_CONTENTS');
        repo.putFile('NEWFILE', tmpfile, { parentRev: 'doesnt exist' }, function (err, fileInfo, commit) {
            expect(err.code).to.equal('EINVAL');
            done();
        });
    });

    var newFileRev = '';

    it('putFile - add', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'NEWFILE');
        fs.writeFileSync(tmpfile, 'NEWFILE_CONTENTS');
        repo.putFile('NEWFILE', tmpfile, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add NEWFILE');
            expect(fileInfo.sha1).to.equal('88e12295e7718805ac086c5499dfae50b07be54a');
            newFileRev = fileInfo.sha1;
            done();
        });
    });

    it('putFile - same contents/hash', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'NEWFILE');
        fs.writeFileSync(tmpfile, 'NEWFILE_CONTENTS');
        repo.putFile('NEWFILE', tmpfile, { hash: newFileRev }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Unchanged NEWFILE');
            expect(fileInfo.sha1).to.equal(newFileRev);
            done();
        });
    });

    it('putFile - update', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'NEWFILE');
        fs.writeFileSync(tmpfile, 'NEWFILE_CONTENTS_UPDATED');
        repo.putFile('NEWFILE', tmpfile, { parentRev: newFileRev }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Update NEWFILE');
            expect(fileInfo.sha1).to.equal('625ea1620ba8bf5245049b73117a58c4b4d95918');
            done();
        });
    });

    function getConflictFilenameSync(fileName, filePath) {
        return fileName + '-Conflict';
    }

    it('putFile - conflict', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'NEWFILE');
        fs.writeFileSync(tmpfile, 'NEWFILE_CONTENTS_UPDATED_AGAIN');
        repo.putFile('NEWFILE', tmpfile, { parentRev: newFileRev, getConflictFilenameSync: getConflictFilenameSync }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add NEWFILE-Conflict');
            expect(fileInfo.path).to.equal('NEWFILE-Conflict');
            expect(fileInfo.sha1).to.equal('6bc781ba12da5d54911bc0ee867c9cff93bbeee0');
            done();
        });
    });

    it('putFile - overwrite', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'NEWFILE');
        fs.writeFileSync(tmpfile, 'NEWFILE_CONTENTS_UPDATED_OVERWRITE');
        repo.putFile('NEWFILE', tmpfile, { parentRev: newFileRev, overwrite: true }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Update NEWFILE');
            expect(fileInfo.path).to.equal('NEWFILE');
            expect(fileInfo.sha1).to.equal('fc5640aae67df3211955256e81a1de847956ca32');
            done();
        });
    });

    it('putFile - overwrite SPECIAL_FILE', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'SPECIAL');
        fs.writeFileSync(tmpfile, 'SPECIAL_FILE_CONTENTS_UPDATED_OVERWRITE');
        repo.putFile(SPECIAL_FILE, tmpfile, { overwrite: true }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Update ' + SPECIAL_FILE);
            expect(fileInfo.path).to.equal(SPECIAL_FILE);
            expect(fileInfo.sha1).to.equal('dbffeabd7c9bc0aecaa3f733c59c65940ab28df0');
            done();
        });
    });
});
