/* jslint node: true */

'use strict';

var assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('installer:installer'),
    path = require('path'),
    safe = require('safetydance'),
    semver = require('semver'),
    superagent = require('superagent'),
    util = require('util');

exports = module.exports = {
    InstallerError: InstallerError,

    provision: provision,
    retire: retire,

    _ensureVersion: ensureVersion
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

function ensureVersion(args, callback) {
    assert.strictEqual(typeof args, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!args.data || !args.data.boxVersionsUrl) return callback(new Error('No boxVersionsUrl specified'));

    if (args.sourceTarballUrl) return callback(null, args);

    superagent.get(args.data.boxVersionsUrl).end(function (error, result) {
        if (error && !error.response) return callback(error);
        if (result.statusCode !== 200) return callback(new Error(util.format('Bad status: %s %s', result.statusCode, result.text)));

        var versions = safe.JSON.parse(result.text);

        if (!versions || typeof versions !== 'object') return callback(new Error('versions is not in valid format:' + safe.error));

        var latestVersion = Object.keys(versions).sort(semver.compare).pop();
        debug('ensureVersion: Latest version is %s etag:%s', latestVersion, result.header['etag']);

        if (!versions[latestVersion]) return callback(new Error('No version available'));
        if (!versions[latestVersion].sourceTarballUrl) return callback(new Error('No sourceTarballUrl specified'));

        args.sourceTarballUrl = versions[latestVersion].sourceTarballUrl;
        args.data.version = latestVersion;

        callback(null, args);
    });
}

function provision(args, callback) {
    assert.strictEqual(typeof args, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (process.env.NODE_ENV === 'test') return callback(null);

    ensureVersion(args, function (error, result) {
        if (error) return callback(error);

        var pargs = [ INSTALLER_CMD ];
        pargs.push('--sourcetarballurl', result.sourceTarballUrl);
        pargs.push('--data', JSON.stringify(result.data));

        debug('provision: calling with args %j', pargs);

        // sudo is required for update()
        spawn('provision', SUDO, pargs, callback);
    });
}

