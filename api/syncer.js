'use strict';

var assert = require('assert'),
    debug = require('debug')('syncer.js'),
    util = require('util');

exports = module.exports = {
    diff: diff,
    diffEntries: diffEntries,
    whatChanged: whatChanged
};

// n-way tree traversal
function traverse(entries, processEntries) {
    var treeIts = [ ]; // tree iterators (indices)
    var i, curTree, curTreePos;

    for (i = 0; i < entries.length; i++) treeIts[i] = 0;

    while (true) {
        var firstEntry = -1; // the tree with the first entry
        for (i = 0; i < entries.length; i++) {
            curTree = entries[i];
            curTreePos = treeIts[i];
            if (curTreePos === curTree.length) continue; // end of this tree

            if (firstEntry === -1 || (curTree[curTreePos].path < entries[firstEntry][treeIts[firstEntry]].path)) {
                firstEntry = i;
            }
        }

        if (firstEntry == -1) break; // done!

        var entriesToProcess = [ ];
        var mask = 0;
        for (i = 0; i < entries.length; i++) {
            curTree = entries[i];
            curTreePos = treeIts[i];
            if (curTreePos !== curTree.length && curTree[curTreePos].path == entries[firstEntry][treeIts[firstEntry]].path) {
                entriesToProcess[i] = curTree[curTreePos];
                mask |= (1 << i);
            } else {
                entriesToProcess[i] = null;
            }
        }

        processEntries(entriesToProcess);

        for (i = 0; i < entries.length; i++) {
            if (mask & (1 << i)) ++treeIts[i];
        }
    }
}

function whatChanged(leftEntry, baseEntry, rightEntry) {
    debug('Left: ', leftEntry ?  util.inspect(leftEntry) : 'null');
    debug('Base: ', baseEntry ?  util.inspect(baseEntry) : 'null');
    debug('Right: ', rightEntry ? util.inspect(rightEntry) : 'null');

    assert(leftEntry || baseEntry || rightEntry); // this is impossible!

    var result;

    if (!leftEntry && baseEntry && !rightEntry) {
        result = null;
    } else if (!leftEntry && !baseEntry && rightEntry) {
        result = { action: 'download', path: rightEntry.path, sha1: rightEntry.sha1, conflict: false };
    } else if (!leftEntry && baseEntry && rightEntry) {
        if (baseEntry.sha1 === rightEntry.sha1) {
            result = { action: 'remove', path: rightEntry.path, sha1: rightEntry.sha1, conflict: false };
        } else {
            result = { action: 'download', path: rightEntry.path, sha1: rightEntry.sha1, conflict: true };
        }
    } else if (leftEntry && !baseEntry && !rightEntry) {
        return { action: 'add', path: leftEntry.path, sha1: leftEntry.sha1, conflict: false };
    } else if (leftEntry && baseEntry && rightEntry) {
        if (leftEntry.sha1 == rightEntry.sha1) {
            result = null;
        } else if (baseEntry.sha1 == rightEntry.sha1) { // file hasn't changed on server
            result = { action: 'update', path: rightEntry.path, sha1: rightEntry.sha1, conflict: false };
        } else if (leftEntry.mtime > rightEntry.mtime) {
            result = { action: 'update', path: leftEntry.path, sha1: leftEntry.sha1, conflict: true };
        } else {
            result = { action: 'download', path: rightEntry.path, sha1: rightEntry.sha1, conflict: true };
        }
    } else if (leftEntry && !baseEntry && rightEntry) { // file appeared in two places
        if (leftEntry.sha1 == rightEntry.sha1) {
            result = null;
        } else if (leftEntry.mtime > rightEntry.mtime) {
            result = { action: 'update', path: leftEntry.path, sha1: leftEntry.sha1, conflict: true };
        } else {
            result = { action: 'download', path: rightEntry.path, sha1: rightEntry.sha1, conflict: true };
        }
    } else if (leftEntry && baseEntry && !rightEntry) { // another client removed the file
        if (baseEntry.sha1 == leftEntry.sha1) {
            result = { action: 'unlink', path: leftEntry.path, sha1: leftEntry.sha1, conflict: false };
        } else {
            // note that we add even if leftEntry.mtime < rightEntry.deletionTime
            result = { action: 'add', path: leftEntry.path, sha1: leftEntry.sha1, conflict: true };
        }
    }

    return result;
}

// returns the changes that need to be done for leftTree to become rightTree with baseTree as reference
function diff(leftTree, baseTree, rightTree) {
    var changes = [ ];

    traverse([leftTree.entries, baseTree.entries, rightTree.entries], function (entries) {
        var leftEntry = entries[0], baseEntry = entries[1], rightEntry = entries[2];
        var change = whatChanged(leftEntry, baseEntry, rightEntry);
        if (change) changes.push(change);
    });

    return changes;
}

function diffEntries(leftEntries, baseEntries, rightEntries) {
    var changes = [ ];

    traverse([leftEntries, baseEntries, rightEntries], function (entries) {
        var leftEntry = entries[0], baseEntry = entries[1], rightEntry = entries[2];
        var change = whatChanged(leftEntry, baseEntry, rightEntry);
        if (change) changes.push(change);
    });

    return changes;
}

