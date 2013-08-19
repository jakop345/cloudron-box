var assert = require('assert'),
    debug = require('debug')('lock.js');

exports = module.exports = Lock;

// Even single threaded programs need locks! When you have disjoint modules
// accessing a shared resource, you want to make sure only one accesses it.
// Lock classes maintains a queue of callbacks to invoke when the lock
// is released.

function Lock() {
    this._locked = false;
    this._callbacks = [ ];
}

// runs function 'withLock' after acquiring the lock. Calls optional argument
// 'postLock' after 'withLock' has been run and the lock has been released.
Lock.prototype.run = function (withLock, postLock) {
    if (this._locked) {
        debug('locked, try later');
        this._callbacks.push({ withLock: withLock, postLock: postLock });
        return;
    }
    this._locked = true;
    debug('locked');
    withLock.call(undefined, this._unlock.bind(this, postLock));
};

Lock.prototype._unlock = function (postLock) {
    assert(this._locked, "Lock is not locked");
    this._locked = false;
    debug('unlocked');
    if (this._callbacks.length != 0) {
        var next = this._callbacks.shift();
        this.run(next.withLock, next.postLock);
    }
    if (postLock) postLock();
};

Lock.prototype.isLocked = function () {
    return this._locked;
};

