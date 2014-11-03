/* jslint node: true */

'use strict';

var assert = require('assert'),
    debug = require('debug')('box/installer'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    spawn = require('child_process').spawn,
    util = require('util');

exports = module.exports = {
    InstallerError: InstallerError,

    initialize: initialize,
    uninitialize: uninitialize,

    provision: provision,
    restore: restore,
    update: update
};

var INSTALLER_CMD = path.join(__dirname, 'scripts/installer.sh'),
    SUDO = '/usr/bin/sudo';

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

function update(args, callback) {
    provision(args, callback);
}

function restore(args, callback) {
    provision(args, callback);
}

function provision(args, callback) {
    assert(typeof args === 'object');
    assert(typeof callback === 'function');

    var pargs = [ INSTALLER_CMD ];
    pargs.push('--appserverurl', args.appServerUrl);
    pargs.push('--fqdn', args.fqdn);
    pargs.push('--restoreurl', args.restoreUrl || '');
    pargs.push('--revision', args.revision);
    pargs.push('--tlscert', args.tls.cert);
    pargs.push('--tlskey', args.tls.key);
    pargs.push('--token', args.token);
    pargs.push('--boxversionsurl', args.boxVersionsUrl);

    debug('provision: calling with args %j', pargs);

    // sudo is required for update()
    var cp = spawn(SUDO, pargs, { timeout: 0 });
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

