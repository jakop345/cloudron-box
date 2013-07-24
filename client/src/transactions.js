'use strict';

var fs = require('fs');
var superagent = require('superagent');
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var path = require('path');

function ClientTransaction(action, fileEntry, config) {
    return new Transaction(action, fileEntry, 'client', config);
}

function ServerTransaction(action, fileEntry, config) {
    return new Transaction(action, fileEntry, 'server', config);
}

function Transaction(action, fileEntry, target, config) {
    assert(typeof action === 'string');
    assert(typeof target === 'string');
    assert(typeof config.backupServer === 'string');
    assert(typeof config.rootFolder === 'string');
    assert(fileEntry);

    this.target = target;
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

    var that = this;
    var requestUrl = this.config.backupServer + '/file';
    var absoluteFilePath = path.join(this.config.rootFolder, this.fileEntry.filename);

    console.log('[II] Process transaction:', this.target, this.action, this.fileEntry.filename);

    if (this.target === 'server') {
        var stats = fs.statSync(absoluteFilePath);
        var requestObject = {
            action: this.action,
            filename: this.fileEntry.filename,
            mtime: stats.mtime.getTime()
        };

        var postStream = superagent.post(requestUrl);
        postStream.field('data', JSON.stringify(requestObject));

        if (this.action !== 'remove') {
            postStream.attach('file', absoluteFilePath);
        }

        postStream.end(callback);
    } else if (this.target === 'client') {
        if (this.action === 'remove') {
            fs.unlink(this.fileEntry.filename, function (error, result) {
                console.log("unlink", error, result);
                callback();
            });
        } else if (this.action === 'add' || this.action === 'update') {
            var getUrl = requestUrl + '/' + this.fileEntry.filename;

            superagent(getUrl, function (error, response) {
                if (error || response.statusCode !== 200) {
                    console.log('[EE] Unable to download file', error ? error.code : '', response ? response.statusCode : '');
                }

                var buffer;
                response.on('data', function (data) {
                    if (!buffer) buffer = data;
                    else buffer += data;

                    console.log('got data', data, buffer);
                });

                response.on('end', function () {
                    console.log('got end', buffer, absoluteFilePath);

                    fs.writeFileSync(absoluteFilePath, buffer);
                    callback();
                });
            });
        }
    } else {
        console.log('[EE] Unsupported transaction target', this.target);
        callback();
    }
};

function TransactionQueue() {
    EventEmitter.call(this);

    this.queue = [];
    this.busy = false;
}
util.inherits(TransactionQueue, EventEmitter);

TransactionQueue.prototype.empty = function() {
    return !this.queue.length;
};

TransactionQueue.prototype.process = function() {
    var that = this;

    if (this.busy) {
        return;
    }

    if (!this.queue.length) {
        this.emit('done');
        this.busy = false;
        return;
    }

    this.busy = true;

    console.log('[II] Process next transaction');

    var t = this.queue.shift();
    t.process(function (res) {
        if (res && res.statusCode !== 200) {
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

    console.log('[II] New transaction:', transaction.target, transaction.action, transaction.fileEntry.filename);

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
    ClientTransaction: ClientTransaction,
    ServerTransaction: ServerTransaction,
    TransactionQueue: TransactionQueue
};
