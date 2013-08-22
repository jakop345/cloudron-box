'use strict';

/* global it:false */
/* global describe:false */

var syncer = require('../syncer'),
    crypto = require('crypto'),
    fs = require('fs'),
    path = require('path'),
    os = require('os');

var assert = require('assert');
var expect = require('expect.js');

describe('diff', function () {
    var leftTree, baseTree, rightTree;

    function initTrees() {
        leftTree = { entries: [ ] };
        baseTree = { entries: [ ] };
        rightTree = { entries: [ ] };
    }

    it('diff - never synced. non-conflicts', function (done) {
        initTrees();
        rightTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'B', sha1: 'SHA1', stat: { mtime: 10, size: 20 } });
        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action == 'download').to.be.ok();
        expect(changes[0].path == 'A').to.be.ok();
        expect(changes[0].conflict == false).to.be.ok();
        expect(changes[1].action == 'add').to.be.ok();
        expect(changes[1].path == 'B').to.be.ok();
        expect(changes[1].conflict == false).to.be.ok();
        done();
    });

    it('diff - never synced. conflicts', function (done) {
        initTrees();
        // Same file on both sides, mtime wins
        rightTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 30, size: 20 } });

        // B is more recent on client
        rightTree.entries.push({ path: 'B', sha1: 'SHA2', stat: { mtime: 10, size: 99 } });
        leftTree.entries.push({ path: 'B', sha1: 'SHA3', stat: { mtime: 30, size: 23 } });

        // C is more recent on server
        rightTree.entries.push({ path: 'C', sha1: 'SHA4', stat: { mtime: 50, size: 40 } });
        leftTree.entries.push({ path: 'C', sha1: 'SHA5', stat: { mtime: 40, size: 23 } });

        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action == 'update').to.be.ok();
        expect(changes[0].path == 'A').to.be.ok();
        expect(changes[0].conflict == true).to.be.ok();
        expect(changes[1].action == 'update').to.be.ok();
        expect(changes[1].path == 'B').to.be.ok();
        expect(changes[1].conflict == true).to.be.ok();
        expect(changes[2].action == 'download').to.be.ok();
        expect(changes[2].path == 'C').to.be.ok();
        expect(changes[2].conflict == true).to.be.ok();
        done();
    });

    it('diff - synced before. non-conflicts', function (done) {
        initTrees();

        // same file everywhere
        rightTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 10, size: 20 } });
        baseTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 30, size: 20 } });

        // client removed B
        rightTree.entries.push({ path: 'B', sha1: 'SHA2', stat: { mtime: 10, size: 20 } });
        baseTree.entries.push({ path: 'B', sha1: 'SHA2', stat: { mtime: 10, size: 20 } });

        // someone removed C
        baseTree.entries.push({ path: 'C', sha1: 'SHA3', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'C', sha1: 'SHA3', stat: { mtime: 10, size: 20 } });

        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action == 'remove').to.be.ok();
        expect(changes[0].path == 'B').to.be.ok();
        expect(changes[0].conflict == false).to.be.ok();
        expect(changes[1].action == 'unlink').to.be.ok();
        expect(changes[1].path == 'C').to.be.ok();
        expect(changes[1].conflict == false).to.be.ok();
        done();
    });

    it('diff - synced before. conflicts', function (done) {
        initTrees();

        // client removed file but it was modified elsewhere
        rightTree.entries.push({ path: 'A', sha1: 'SHA2', stat: { mtime: 20, size: 20 } });
        baseTree.entries.push({ path: 'A', sha1: 'SHA1', stat: { mtime: 10, size: 20 } });

        // modified everywhere, client wins
        rightTree.entries.push({ path: 'B', sha1: 'SHA3', stat: { mtime: 30, size: 20 } });
        baseTree.entries.push({ path: 'B', sha1: 'SHA4', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'B', sha1: 'SHA5', stat: { mtime: 40, size: 20 } });

        // modified everywhere server wins
        rightTree.entries.push({ path: 'C', sha1: 'SHA6', stat: { mtime: 30, size: 20 } });
        baseTree.entries.push({ path: 'C', sha1: 'SHA7', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'C', sha1: 'SHA8', stat: { mtime: 20, size: 20 } });

        // client modified but someone removed it on server
        baseTree.entries.push({ path: 'D', sha1: 'SHA9', stat: { mtime: 10, size: 20 } });
        leftTree.entries.push({ path: 'D', sha1: 'SHA0', stat: { mtime: 20, size: 20 } });

        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action == 'download').to.be.ok();
        expect(changes[0].path == 'A').to.be.ok();
        expect(changes[0].conflict == true).to.be.ok();
        expect(changes[1].action == 'update').to.be.ok();
        expect(changes[1].path == 'B').to.be.ok();
        expect(changes[1].conflict == true).to.be.ok();
        expect(changes[2].action == 'download').to.be.ok();
        expect(changes[2].path == 'C').to.be.ok();
        expect(changes[2].conflict == true).to.be.ok();
        expect(changes[3].action == 'add').to.be.ok();
        expect(changes[3].path == 'D').to.be.ok();
        expect(changes[3].conflict == true).to.be.ok();

        done();
    });
});
 
describe('canUpdate', function() {
});

