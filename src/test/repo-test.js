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
    expect = require('expect.js'),
    constants = require('constants'),
    mkdirp = require('mkdirp');

var EMAIL = 'no@bo.dy';
var USERNAME = 'nobody';
// \u00A3 - pound, \u20AC - euro
var SPECIAL_FILE = 'SPECIAL \t\n~`!@#$%^&*()_+-=[]{}|,.<>?\u00A3\u20AC ';

var tmpdirname = 'repo-tmp-' + crypto.randomBytes(4).readUInt32LE(0);
var tmpdir = path.join(os.tmpdir(), tmpdirname);
var rootdirname = 'repo-test-' + crypto.randomBytes(4).readUInt32LE(0);
var rootdir = path.join(os.tmpdir(), rootdirname);
var repo = new Repo(rootdir, tmpdir);

function setup(done) {
    mkdirp(tmpdir, done);
}

function cleanup(done) {
    rimraf(tmpdir, function (error) {
        expect(error).to.be(null);
        rimraf(tmpdir, done);
    });
}

describe('Repo', function () {
    before(setup);
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

    it('addFile - subdirs', function (done) {
        var tmpfile = path.join(os.tmpdir(), 'DEEP');
        fs.writeFileSync(tmpfile, 'DEEP CONTENTS');
        repo.addFile('dir/subdir/DEEP', { file: tmpfile }, function (err, fileInfo, commit) {
            expect(commit.subject).to.equal('Add DEEP');
            expect(fileInfo.sha1).to.equal('652e9b552d21dcbfa5f8f7c7e053da8fbade3498');
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

    // we don't do copy detection intentionally since it's expensive
    it('diffTree - copy file', function (done) {
        repo.diffTree('HEAD~1', 'HEAD', function (err, changes) {
            expect(changes.length).to.equal(1);
            expect(changes[0].path).to.equal('README.copy');
            expect(changes[0].status).to.equal('ADDED');
            expect(changes[0].mode).to.equal(parseInt('100644', 8));
            expect(changes[0].rev).to.equal('2180e82647ff9a3e1a93ab43b81c82025c33c6e2');
            done(err);
        });
    });

    it('moveFile', function (done) {
        repo.moveFile('README.copy', 'README.move', function (err, fileInfo, commit) {
            expect(fileInfo.path).to.equal('README.move');
            expect(commit.subject).to.equal('Move from README.copy to README.move');
            done();
        });
    });

    it('diffTree - renamed/moved file', function (done) {
        repo.diffTree('HEAD~1', 'HEAD', function (err, changes) {
            expect(changes.length).to.equal(1);
            expect(changes[0].oldPath).to.equal('README.copy');
            expect(changes[0].path).to.equal('README.move');
            expect(changes[0].status).to.equal('RENAMED');
            expect(changes[0].oldMode).to.equal(parseInt('100644', 8));
            expect(changes[0].mode).to.equal(parseInt('100644', 8));
            expect(changes[0].oldRev).to.equal('2180e82647ff9a3e1a93ab43b81c82025c33c6e2');
            expect(changes[0].rev).to.equal('2180e82647ff9a3e1a93ab43b81c82025c33c6e2');
            done(err);
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

    it('createReadStream - invalid file inside repo', function (done) {
        var readme = repo.createReadStream('RANDOM');
        readme.on('error', function () { done(); });
    });

    it('createReadStream - invalid path outside repo', function (done) {
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

    it('getTree - valid tree non-recursive', function (done) {
        repo.getTree('HEAD', function (err, tree) {
            expect(tree.entries.length).to.greaterThan(3);
            var paths = tree.entries.map(function (entry) { return entry.path; });
            var names = tree.entries.map(function (entry) { return entry.name; });

            expect(paths).to.contain('README');
            expect(names).to.contain('README');

            expect(paths).to.contain(SPECIAL_FILE);
            expect(names).to.contain(SPECIAL_FILE);

            expect(paths).to.contain('dir'); // when not listing subtrees, we only get dir name
            expect(names).to.contain('dir');
            done();
        });
    });

    it('getTree - root tree recursive', function (done) {
        repo.getTree('HEAD', { listSubtrees: true }, function (err, tree) {
            expect(tree.entries.length).to.greaterThan(3);
            var paths = tree.entries.map(function (entry) { return entry.path; });
            var names = tree.entries.map(function (entry) { return entry.name; });
            expect(paths).to.contain('README');
            expect(paths).to.contain(SPECIAL_FILE);
            // all dirs must be listed
            expect(paths).to.contain('dir');
            expect(names).to.contain('dir');

            expect(paths).to.contain('dir/subdir');
            expect(names).to.contain('subdir');

            expect(paths).to.contain('dir/subdir/DEEP');
            expect(names).to.contain('DEEP');
            done();
        });
    });

    it('getTree - subdir recursive', function (done) {
        repo.getTree('HEAD', { path: 'dir', listSubtrees: true }, function (err, tree) {
            var paths = tree.entries.map(function (entry) { return entry.path; });
            expect(paths).to.contain('dir/subdir');
            expect(paths).to.contain('dir/subdir/DEEP');
            done();
        });
    });

    it('getTree - subdir/', function (done) {
        repo.getTree('HEAD', { path: 'dir/subdir/', listSubtrees: true }, function (err, tree) {
            var paths = tree.entries.map(function (entry) { return entry.path; });
            expect(paths).to.contain('dir/subdir');
            expect(paths).to.contain('dir/subdir/DEEP');
            done();
        });
    });

    it('getTree - invalid path', function (done) {
        // this is the current behavior but it can be changed to error
        repo.getTree('HEAD', { path: 'dirx' }, function (err, tree) {
            expect(err).to.be(null);
            expect(tree.entries).to.be.empty();
            done();
        });
    });

    it('getTree - invalid revision', function (done) {
        // this is the current behavior but it can be changed to error
        repo.getTree('235789', function (err, tree) {
            expect(err).to.be.ok();
            expect(tree).to.not.be.ok();
            done();
        });
    });

    it('getTree - null tree', function (done) {
        repo.getTree('', function (err, tree) {
            expect(tree.entries.length).to.equal(0);
            done();
        });
    });

    it('listFiles - root tree', function (done) {
        repo.listFiles({ listSubtrees: true }, function (err, tree) {
            expect(tree.entries.length).to.greaterThan(3);

            var paths = tree.entries.map(function (entry) { return entry.path; });
            var names = tree.entries.map(function (entry) { return entry.name; });
            expect(paths).to.contain('README');
            expect(paths).to.contain(SPECIAL_FILE);
            // all dirs must be listed
            expect(paths).to.contain('dir');
            expect(names).to.contain('dir');

            expect(paths).to.contain('dir/subdir');
            expect(names).to.contain('subdir');

            expect(paths).to.contain('dir/subdir/DEEP');
            expect(names).to.contain('DEEP');

            tree.entries.forEach(function (entry) { expect(entry.mtime).to.be.a('number'); });

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

            var names = entries.map(function (entry) { return entry.name; });
            expect(names).to.contain(SPECIAL_FILE);

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
            expect(commit).to.not.be.ok();
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
            expect(fileInfo).to.not.be.ok();
            expect(commit).to.not.be.ok();
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

    it('createDirectory - valid directory', function (done) {
        repo.createDirectory('dummy_dir', function (err, entry) {
            expect(err).to.be(null);
            expect(entry).to.not.be(null);
            expect(entry.name).to.be('dummy_dir');
            done();
        });
    });

    it('createDirectory - overwrite file', function (done) {
        repo.createDirectory('NEWFILE', function (err, entry) {
            expect(err.code).to.be('ENOTDIR');
            expect(entry).to.not.be.ok();
            done();
        });
    });

    it('createDirectory - list empty directory', function (done) {
        repo.listFiles({ path: 'dummy_dir/', listSubtrees: false }, function (err, tree) {
            expect(err).to.be(null);
            expect(tree.entries).to.be.empty();
            done();
        });
    });

    it('createDirectory - metadata of empty directory', function (done) {
        repo.metadata('dummy_dir', function (err, metadata, hash) {
            expect(err).to.be(null);
            expect(metadata.length).to.be(0);
            expect(hash).to.be.a('string');
            done();
        });
    });

    it('createDirectory - add file to empty directory', function (done) {
        repo.addFileWithData('dummy_dir/dummy_file', 'data', function (err, entry) {
            expect(err).to.be(null);
            expect(entry).to.be.an('object');
            done();
        });
    });

    it('createDirectory - listFiles must exclude magic file', function (done) {
        repo.listFiles({ path: 'dummy_dir/', listSubtrees: false }, function (err, tree) {
            expect(err).to.be(null);
            expect(tree.entries.length).to.be(1);
            expect(tree.entries[0].name).to.be('dummy_file');
            done();
        });
    });

    it('createDirectory - metadata must exclude magic file', function (done) {
        repo.metadata('dummy_dir/', function (err, metadata, hash) {
            expect(err).to.be(null);
            expect(metadata.length).to.be(1);
            expect(metadata[0].name).to.be('dummy_file');
            expect(hash).to.be.a('string');
            done();
        });
    });


    it('_absoluteFilePath', function (done) {
        expect(repo._absoluteFilePath('foo')).to.equal(path.join(repo.checkoutDir, 'foo'));
        expect(repo._absoluteFilePath('foo/bar')).to.equal(path.join(repo.checkoutDir, 'foo/bar'));
        expect(repo._absoluteFilePath('foo/../bar')).to.equal(path.join(repo.checkoutDir, 'bar'));
        expect(repo._absoluteFilePath('./foo')).to.equal(path.join(repo.checkoutDir, 'foo'));
        expect(repo._absoluteFilePath('.')).to.equal(repo.checkoutDir);
        expect(repo._absoluteFilePath('')).to.equal(repo.checkoutDir);
        expect(repo._absoluteFilePath('.gitx')).to.equal(path.join(repo.checkoutDir, '.gitx'));

        expect(repo._absoluteFilePath('.git/foo')).to.equal(null);
        expect(repo._absoluteFilePath(repo.checkoutDir)).to.equal(null);
        expect(repo._absoluteFilePath('..')).to.be(null);
        expect(repo._absoluteFilePath('../..')).to.be(null);
        expect(repo._absoluteFilePath('/')).to.be(null);
        expect(repo._absoluteFilePath('/tmp')).to.be(null);

        done();
    });
});
