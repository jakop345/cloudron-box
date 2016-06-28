'use strict';

exports = module.exports = {
    set: set,
    clear: clear,
    get: get,

    UPDATE: 'update',
    BACKUP: 'backup',
    MIGRATE: 'migrate'
};

var assert = require('assert'),
    debug = require('debug')('box:progress');

// if progress.update or progress.backup are object, they will contain 'percent' and 'message' properties
// otherwise no such operation is currently ongoing
var progress = {
    update: null,
    backup: null
};

// We use -1 for percentage to indicate errors
function set(tag, percent, message) {
    assert.strictEqual(typeof tag, 'string');
    assert.strictEqual(typeof percent, 'number');
    assert.strictEqual(typeof message, 'string');

    progress[tag] = {
        percent: percent,
        message: message
    };

    debug('%s: %s %s', tag, percent, message);
}

function clear(tag) {
    assert.strictEqual(typeof tag, 'string');

    progress[tag] = null;

    debug('clearing %s', tag);
}

function get() {
    return progress;
}
