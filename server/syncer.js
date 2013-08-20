'use strict';

var assert = require('assert'),
    debug = require('debug')('syncer.js');

exports = module.exports = {
    diff: diff
};

// n-way tree traversal
function traverse(entries, processEntries) {
    var treeIts = [ ]; // tree iterators (indices)
    for (var i = 0; i < entries.length; i++) treeIts[i] = 0;

    while (true) {
        var firstEntry = -1; // the tree with the first entry
        for (var i = 0; i < entries.length; i++) {
            var curTree = entries[i], curTreePos = treeIts[i];
            if (curTreePos == curTree.length) continue; // end of this tree

            if (firstEntry == -1 || (curTree[curTreePos].path < entries[firstEntry][treeIts[firstEntry]].path)) {
                firstEntry = i;
            }
        }

        if (firstEntry == -1) break; // done!

        var entriesToProcess = [ ];
        var mask = 0;
        for (var i = 0; i < entries.length; i++) {
            var curTree = entries[i], curTreePos = treeIts[i];
            if (curTreePos != curTree.length
                && curTree[curTreePos].path == entries[firstEntry][treeIts[firstEntry]].path) {
                entriesToProcess[i] = curTree[curTreePos];
                mask |= (1 << i);
            } else {
                entriesToProcess[i] = null;
            }
        }

        processEntries(entriesToProcess);

        for (var i = 0; i < entries.length; i++) {
            if (mask & (1 << i)) ++treeIts[i];
        }
    }
}

function whatChanged(leftEntry, baseEntry, rightEntry) {
    debug('Process: ', leftEntry ? leftEntry.path : 'null',
                       baseEntry ? baseEntry.path : 'null',
                       rightEntry ? rightEntry.path : 'null');

    assert(leftEntry || baseEntry || rightEntry); // this is impossible!

    var result;

    if (!leftEntry && baseEntry && !rightEntry) {
        result = null;
    } else if (!leftEntry && !baseEntry && rightEntry) {
        result = { action: 'download', path: rightEntry.path, conflict: false };
    } else if (!leftEntry && baseEntry && rightEntry) {
        if (baseEntry.sha1 == rightEntry.sha1) {
            result = { action: 'remove', path: rightEntry.path, conflict: false };
        } else {
            result = { action: 'download', path: rightEntry.path, conflict: true };
        }
    } else if (leftEntry && !baseEntry && !rightEntry) {
        return { action: 'add', path: leftEntry.path, conflict: false };
    } else if (leftEntry && baseEntry && rightEntry) {
        if (leftEntry.sha1 == rightEntry.sha1) {
            result = null;
        } else if (leftEntry.stat.mtime > rightEntry.stat.mtime) {
            result = { action: 'update', path: rightEntry.path, conflict: true };
        } else {
            result = { action: 'download', path: rightEntry.path, conflict: true };
        }
    } else if (leftEntry && !baseEntry && rightEntry) { // file appeared in two places
        if (leftEntry.stat.mtime > rightEntry.stat.mtime) {
            result = { action: 'update', path: rightEntry.path, conflict: true };
        } else {
            result = { action: 'download', path: rightEntry.path, conflict: true };
        }
    } else if (leftEntry && baseEntry && !rightEntry) { // another client removed the file
        if (baseEntry.sha1 == leftEntry.sha1 && leftEntry.stat.mtime <= baseEntry.stat.mtime) {
            result = { action: 'unlink', path: leftEntry.path, conflict: false };
        } else {
            result = { action: 'add', path: leftEntry.path, conflict: true };
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

