'use strict';

var fs = require('fs');
var superagent = require('superagent');
var assert = require('assert');

function Transaction(action, fileEntry, config) {
    assert(typeof action === 'string');
    assert(typeof config.backupServer === 'string');
    assert(typeof config.rootFolder === 'string');
    assert(fileEntry);


    this.action = action;
    this.fileEntry = fileEntry;
    this.config = config;
}

Transaction.prototype.merge = function(t) {
    if (this.fileEntry.filename === t.fileEntry.filename) {
        this.action = t.action;
        this.fileEntry = t.fileEntry;
        return true;
    }

    return false;
};

Transaction.prototype.process = function(callback) {
    assert(typeof callback === 'function');

    var stats = fs.statSync(this.fileEntry.filename);
    var requestUrl = this.config.backupServer + '/file';
    var requestObject = {
        action: this.action,
        filename: this.fileEntry.filename,
        mtime: stats.mtime.getTime()
    };

    var postStream = superagent.post(requestUrl);
    postStream.field('data', JSON.stringify(requestObject));

    if (this.action !== 'remove') {
        postStream.attach('file', this.config.rootFolder + this.fileEntry.filename);
    }

    postStream.end(callback);
};

function TransactionQueue() {
    this.queue = [];
    this.processing = false;
}

TransactionQueue.prototype.process = function() {
    var that = this;

    if (this.processing) {
        return;
    }

    if (!this.queue.length) {
        this.processing = false;
        return;
    }

    this.processing = true;

    console.log('[II] Process next transaction');

    var t = this.queue.shift();
    t.process(function (res) {
        if (res.statusCode !== 200) {
            console.log('[EE] Error processing transaction', t);
            console.log('[EE] Response', res.statusCode, res.text);
        } else {
            console.log('[II] Transaction successful.');
        }

        that.processing = false;
        that.process();
    });
};

TransactionQueue.prototype.add = function(transaction) {
    var merged = false;

    console.log('[II] Add transaction', transaction.action, transaction.fileEntry.filename);

    for (var i = 0; i < this.queue.length; ++i) {
        var t = this.queue[i];

        if (t.merge(transaction)) {
            merged = true;
            break;
        }
    }

    if (!merged) {
        this.queue.push(transaction);
    }
};

module.exports = {
    Transaction: Transaction,
    TransactionQueue: TransactionQueue
};
