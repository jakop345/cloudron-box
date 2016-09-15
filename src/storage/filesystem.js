'use strict';

exports = module.exports = {
    getRestoreUrl: getRestoreUrl,

    copyObject: copyObject,
    getAllPaged: getAllPaged,

    getBackupCredentials: getBackupCredentials
};

var assert = require('assert');

function getBackupCredentials(apiConfig, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    callback(null, {});
}

function getAllPaged(apiConfig, page, perPage, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    return callback(null, []);
}

function getRestoreUrl(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    callback(null, { url: '' });
}

function copyObject(apiConfig, from, to, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof from, 'string');
    assert.strictEqual(typeof to, 'string');
    assert.strictEqual(typeof callback, 'function');

    callback(null);
}
