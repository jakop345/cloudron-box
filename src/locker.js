'use strict';

var assert = require('assert'),
    debug = require('debug')('box:locker'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

function Locker() {
    this._operation = null;
    this._timestamp = null;
    this._watcherId = -1;
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
    this._timestamp = new Date();
    var that = this;
    this._watcherId = setInterval(function () { debug('Lock unreleased %s', that._operation); }, 1000 * 60 * 5);

    debug('Acquired : %s', this._operation);

    this.emit('locked', this._operation);

    return null;
};

Locker.prototype.unlock = function (operation) {
    assert.strictEqual(typeof operation, 'string');

    if (this._operation !== operation) throw new Error('Mismatched unlock. Current lock is for ' + this._operation); // throw because this is a programming error

    debug('Released : %s', this._operation);

    this._operation = null;
    this._timestamp = null;
    clearInterval(this._watcherId);
    this._watcherId = -1;

    this.emit('unlocked', operation);

    return null;
};

exports = module.exports = new Locker();
