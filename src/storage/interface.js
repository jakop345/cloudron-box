'use strict';

// -------------------------------------------
//  This file just describes the interface
//
//  New backends can start from here
// -------------------------------------------

exports = module.exports = {
    getBoxBackupDetails: getBoxBackupDetails,
    getAppBackupDetails: getAppBackupDetails,

    getAllPaged: getAllPaged,

    getRestoreUrl: getRestoreUrl,

    copyObject: copyObject
};

var assert = require('assert');

function getBoxBackupDetails(apiConfig, id, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    // Result: { backupScriptArguments: [] }
    // The resulting array consists of string passed down 1to1 to the backupbox.sh

    callback(new Error('not implemented'));
}

function getAppBackupDetails(apiConfig, appId, dataId, configId, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof dataId, 'string');
    assert.strictEqual(typeof configId, '');
    assert.strictEqual(typeof callback, 'function');

    // Result: { backupScriptArguments: [] }
    // The resulting array consists of string passed down 1to1 to the backupapp.sh

    callback(new Error('not implemented'));
}

function getAllPaged(apiConfig, page, perPage, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    // Result: { backupScriptArguments: [ { creationTime: <timestamp> }, restoreKey: <filename>, dependsOn: [] ] }
    // The resulting array consists of objects representing each backup

    callback(new Error('not implemented'));
}

function getRestoreUrl(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    // Result: { url: <restoreUrl> }
    // The resulting url must work with curl as it is passed into start.sh and restoreapp.sh

    callback(new Error('not implemented'));
}

function copyObject(apiConfig, from, to, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof from, 'string');
    assert.strictEqual(typeof to, 'string');
    assert.strictEqual(typeof callback, 'function');

    // Result: none

    callback(new Error('not implemented'));
}
