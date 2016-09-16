'use strict';

exports = module.exports = {
    getRestoreUrl: getRestoreUrl,

    copyObject: copyObject,
    getAllPaged: getAllPaged,

    getBackupDetails: getBackupDetails
};

var assert = require('assert');

function getBackupDetails(apiConfig, id, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || '/tmp/backups';

    var details = {
        backupScriptArguments: [ 'filesystem', backupFolder, id, apiConfig.key ]
    };

    callback(null, details);
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
