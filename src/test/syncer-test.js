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
        rightTree.entries.push({ path: 'A', sha1: 'SHA1', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'B', sha1: 'SHA2', mtime: 10, size: 20 });
        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action).to.equal('download');
        expect(changes[0].path).to.equal('A');
        expect(changes[0].sha1).to.equal('SHA1');
        expect(changes[0].conflict).to.equal(false);
        expect(changes[1].action).to.equal('add');
        expect(changes[1].path).to.equal('B');
        expect(changes[1].sha1).to.equal('SHA2');
        expect(changes[1].conflict).to.equal(false);
        done();
    });

    it('diff - never synced. conflicts', function (done) {
        initTrees();
        // Same file on both sides, mtime wins
        rightTree.entries.push({ path: 'A', sha1: 'SHA0', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'A', sha1: 'SHA1', mtime: 30, size: 20 });

        // B is more recent on client
        rightTree.entries.push({ path: 'B', sha1: 'SHA2', mtime: 10, size: 99 });
        leftTree.entries.push({ path: 'B', sha1: 'SHA3', mtime: 30, size: 23 });

        // C is more recent on server
        rightTree.entries.push({ path: 'C', sha1: 'SHA4', mtime: 50, size: 40 });
        leftTree.entries.push({ path: 'C', sha1: 'SHA5', mtime: 40, size: 23 });

        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action).to.equal('update');
        expect(changes[0].path).to.equal('A');
        expect(changes[0].sha1).to.equal('SHA1');
        expect(changes[0].conflict).to.equal(true);

        expect(changes[1].action).to.equal('update');
        expect(changes[1].path).to.equal('B');
        expect(changes[1].sha1).to.equal('SHA3');
        expect(changes[1].conflict).to.equal(true);

        expect(changes[2].action).to.equal('download');
        expect(changes[2].path).to.equal('C');
        expect(changes[2].sha1).to.equal('SHA4');
        expect(changes[2].conflict).to.equal(true);
        done();
    });

    it('diff - synced before. non-conflicts', function (done) {
        initTrees();

        // same file everywhere
        rightTree.entries.push({ path: 'A', sha1: 'SHA1', mtime: 10, size: 20 });
        baseTree.entries.push({ path: 'A', sha1: 'SHA1', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'A', sha1: 'SHA1', mtime: 30, size: 20 });

        // client removed B
        rightTree.entries.push({ path: 'B', sha1: 'SHA2', mtime: 10, size: 20 });
        baseTree.entries.push({ path: 'B', sha1: 'SHA2', mtime: 10, size: 20 });

        // someone removed C
        baseTree.entries.push({ path: 'C', sha1: 'SHA3', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'C', sha1: 'SHA3', mtime: 10, size: 20 });

        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action).to.equal('remove');
        expect(changes[0].path).to.equal('B');
        expect(changes[0].sha1).to.equal('SHA2');
        expect(changes[0].conflict).to.equal(false);

        expect(changes[1].action).to.equal('unlink');
        expect(changes[1].path).to.equal('C');
        expect(changes[1].sha1).to.equal('SHA3');
        expect(changes[1].conflict).to.equal(false);
        done();
    });

    it('diff - synced before. conflicts', function (done) {
        initTrees();

        // client removed file but it was modified elsewhere
        rightTree.entries.push({ path: 'A', sha1: 'SHA2', mtime: 20, size: 20 });
        baseTree.entries.push({ path: 'A', sha1: 'SHA1', mtime: 10, size: 20 });

        // modified everywhere, client wins
        rightTree.entries.push({ path: 'B', sha1: 'SHA3', mtime: 30, size: 20 });
        baseTree.entries.push({ path: 'B', sha1: 'SHA4', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'B', sha1: 'SHA5', mtime: 40, size: 20 });

        // modified everywhere server wins
        rightTree.entries.push({ path: 'C', sha1: 'SHA6', mtime: 30, size: 20 });
        baseTree.entries.push({ path: 'C', sha1: 'SHA7', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'C', sha1: 'SHA8', mtime: 20, size: 20 });

        // client modified but someone removed it on server
        baseTree.entries.push({ path: 'D', sha1: 'SHA9', mtime: 10, size: 20 });
        leftTree.entries.push({ path: 'D', sha1: 'SHA0', mtime: 20, size: 20 });

        var changes = syncer.diff(leftTree, baseTree, rightTree);
        expect(changes[0].action).to.equal('download');
        expect(changes[0].path).to.equal('A');
        expect(changes[0].sha1).to.equal('SHA2');
        expect(changes[0].conflict).to.equal(true);

        expect(changes[1].action).to.equal('update');
        expect(changes[1].path).to.equal('B');
        expect(changes[1].sha1).to.equal('SHA5');
        expect(changes[1].conflict).to.equal(true);

        expect(changes[2].action).to.equal('download');
        expect(changes[2].path).to.equal('C');
        expect(changes[2].sha1).to.equal('SHA6');
        expect(changes[2].conflict).to.equal(true);

        expect(changes[3].action).to.equal('add');
        expect(changes[3].path).to.equal('D');
        expect(changes[3].sha1).to.equal('SHA0');
        expect(changes[3].conflict).to.equal(true);

        done();
    });
});
 
describe('canUpdate', function() {
});

