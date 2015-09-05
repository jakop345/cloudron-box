'use strict';

var assert = require('assert'),
    debug = require('debug')('box:locker'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

function Locker() {
    this._operation = null;
    this._timestamp = null;
    this._watcherId = -1;
    this._lockDepth = 0; // recursive locks
}
util.inherits(Locker, EventEmitter);

// these are mutually exclusive operations
Locker.prototype.OP_BOX_UPDATE = 'box_update';
Locker.prototype.OP_FULL_BACKUP = 'full_backup';
Locker.prototype.OP_APPTASK = 'apptask';
Locker.prototype.OP_MIGRATE = 'migrate';

Locker.prototype.lock = function (operation) {
    assert.strictEqual(typeof operation, 'string');

    if (this._operation !== null) return new Error('Already locked for ' + this._operation);

    this._operation = operation;
    ++this._lockDepth;
    this._timestamp = new Date();
    var that = this;
    this._watcherId = setInterval(function () { debug('Lock unreleased %s', that._operation); }, 1000 * 60 * 5);

    debug('Acquired : %s', this._operation);

    this.emit('locked', this._operation);

    return null;
};

Locker.prototype.recursiveLock = function (operation) {
    if (this._operation === operation) {
        ++this._lockDepth;
        debug('Re-acquired : %s Depth : %s', this._operation, this._lockDepth);
        return null;
    }

    return this.lock(operation);
};

Locker.prototype.unlock = function (operation) {
    assert.strictEqual(typeof operation, 'string');

    if (this._operation !== operation) throw new Error('Mismatched unlock. Current lock is for ' + this._operation); // throw because this is a programming error

    if (--this._lockDepth === 0) {
        debug('Released : %s', this._operation);

        this._operation = null;
        this._timestamp = null;
        clearInterval(this._watcherId);
        this._watcherId = -1;
    } else {
        debug('Recursive lock released : %s. Depth : %s', this._operation, this._lockDepth);
    }

    this.emit('unlocked', operation);

    return null;
};

exports = module.exports = new Locker();
