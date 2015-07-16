'use strict';

exports = module.exports = {
    lock: lock,
    unlock: unlock,

    OP_BOX_UPDATE: 'box_update',
    OP_FULL_BACKUP: 'full_backup',
    OP_APPTASK: 'apptask'
};

var assert = require('assert'),
    debug = require('debug')('box:locker');

var gLock = { operation: null, timestamp: null, watcherId: -1 };

function lock(operation) {
    assert.strictEqual(typeof operation, 'string');

    if (gLock.operation !== null) return new Error('Already locked for ' + gLock.operation);

    gLock.operation = operation;
    gLock.timestamp = new Date();
    gLock.watcherId = setInterval(function () { debug('Lock unreleased %s', gLock.operation); }, 1000 * 60 * 5);

    debug('Acquired : %s', gLock.operation);

    return null;
}

function unlock(operation) {
    assert.strictEqual(typeof operation, 'string');

    if (gLock.operation !== operation) throw new Error('Mismatched unlock. Current lock is for ' + gLock.operation); // throw because this is a programming error

    debug('Released : %s', gLock.operations);

    gLock.operation = null;
    gLock.timestamp = null;
    clearInterval(gLock.watcherId);
    gLock.watcherId = -1;

    return null;
}

