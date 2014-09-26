/* jslint node: true */

'use strict';

var backups = require('./backups.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize
};

var backupTimerId = null;

function initialize() {
    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    backupTimerId = setInterval(backups.createBackup, 4 * 60 * 60 * 1000);
}

function uninitialize() {
    clearInterval(backupTimerId);
    backupTimerId = null;
}

