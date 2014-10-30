/* jslint node: true */

'use strict';

var assert = require('assert'),
    debug = require('debug')('box/installer'),
    spawn = require('child_process').spawn,
    os = require('os'),
    path = require('path'),
    util = require('util');

exports = module.exports = {
    InstallerError: InstallerError,

    initialize: initialize,
    uninitialize: uninitialize,

    provision: provision,
    restore: restore,
};

var INSTALLER_CMD = path.join(__dirname, 'scripts/installer.sh');
 
function InstallerError(reason, info) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    this.message = !info ? reason : (typeof info === 'object' ? JSON.stringify(info) : info);
}
util.inherits(InstallerError, Error);
InstallerError.INTERNAL_ERROR = 1;
InstallerError.ALREADY_PROVISIONED = 2;

function initialize() {
}

function uninitialize() {
}

function restore(args, callback) {
    provision(args, callback);
}

function provision(args, callback) {
    assert(typeof args === 'object');
    assert(typeof callback === 'function');

    var env = {
        PROVISION_APP_SERVER_URL: args.appServerUrl,
        PROVISION_FQDN: args.fqdn,
        PROVISION_IS_DEV: args.isDev,
        PROVISION_RESTORE_URL: args.restoreUrl || '',
        PROVISION_REVISION: args.revision,
        PROVISION_TLS_CERT: args.tls.cert,
        PROVISION_TLS_KEY: args.tls.key,
        PROVISION_TOKEN: args.token
    };

    debug('provision: calling %s with env %j', INSTALLER_CMD, env);

    var cp = spawn(INSTALLER_CMD, [ ], { env: env, timeout: 0 });
    cp.stdout.on('data', function (data) { debug(data); });
    cp.stderr.on('data', function (data) { debug(data); });

    cp.on('error', function (code, signal) {
        debug('child process errored', error);
        callback(error);
    });

    cp.on('exit', function (code, signal) {
        debug('child process exited. code: %d signal: %d', code, signal);
        if (signal) return callback(new Error('Exited with signal ' + signal));
        if (code !== 0) return callback(new Error('Exited with code ' + code));

        callback(null);
    });
}

