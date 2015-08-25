/* jslint node: true */

'use strict';

var assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('installer:installer'),
    path = require('path'),
    util = require('util');

exports = module.exports = {
    InstallerError: InstallerError,

    provision: provision,
    retire: retire
};

var INSTALLER_CMD = path.join(__dirname, 'scripts/installer.sh'),
    RETIRE_CMD = path.join(__dirname, 'scripts/retire.sh'),
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

function spawn(tag, cmd, args, callback) {
    assert.strictEqual(typeof tag, 'string');
    assert.strictEqual(typeof cmd, 'string');
    assert(util.isArray(args));
    assert.strictEqual(typeof callback, 'function');

    var cp = child_process.spawn(cmd, args, { timeout: 0 });
    cp.stdout.setEncoding('utf8');
    cp.stdout.on('data', function (data) { debug('%s (stdout): %s', tag, data); });
    cp.stderr.setEncoding('utf8');
    cp.stderr.on('data', function (data) { debug('%s (stderr): %s', tag, data); });

    cp.on('error', function (error) {
        debug('%s : child process errored %s', tag, error.message);
        callback(error);
    });

    cp.on('exit', function (code, signal) {
        debug('%s : child process exited. code: %d signal: %d', tag, code, signal);
        if (signal) return callback(new Error('Exited with signal ' + signal));
        if (code !== 0) return callback(new Error('Exited with code ' + code));

        callback(null);
    });
}

function retire(args, callback) {
    assert.strictEqual(typeof args, 'object');
    assert.strictEqual(typeof callback, 'function');

    var pargs = [ RETIRE_CMD ];
    pargs.push('--data', JSON.stringify(args.data));

    debug('retire: calling with args %j', pargs);

    if (process.env.NODE_ENV === 'test') return callback(null);

    // sudo is required for retire()
    spawn('retire', SUDO, pargs, callback);
}

function provision(args, callback) {
    assert.strictEqual(typeof args, 'object');
    assert.strictEqual(typeof callback, 'function');

    var pargs = [ INSTALLER_CMD ];
    pargs.push('--sourcetarballurl', args.sourceTarballUrl);
    pargs.push('--data', JSON.stringify(args.data));

    debug('provision: calling with args %j', pargs);

    if (process.env.NODE_ENV === 'test') return callback(null);

    // sudo is required for update()
    spawn('provision', SUDO, pargs, callback);
}

