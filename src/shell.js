'use strict';

var assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('box:shell.js'),
    once = require('once'),
    util = require('util');

exports = module.exports = {
    sudo: sudo,
    exec: exec
};

var SUDO = '/usr/bin/sudo';

function exec(tag, file, args, callback) {
    assert(typeof tag === 'string');
    assert(typeof file === 'string');
    assert(util.isArray(args));
    assert(typeof callback === 'function');

    var callback = once(callback); // exit may or may not be called after an 'error'

    debug(tag + ' execFile: %s %s', file, args.join(' '));

    var cp = child_process.spawn(file, args);
    cp.stdout.on('data', function (data) {
        debug(tag + ' (stdout): %s', data.toString('utf8'));
    });

    cp.stderr.on('data', function (data) {
        debug(tag + ' (stderr): %s', data.toString('utf8'));
    });

    cp.on('exit', function (code, signal) {
        if (code || signal) debug(tag + ' code: %s, signal: %s', code, signal);

        callback(code === 0 ? null : new Error(util.format('Exited with error %s signal %s', code, signal)));
    });

    cp.on('error', function (error) {
        debug(tag + ' code: %s, signal: %s', error.code, error.signal);
        callback(error);
    });

    return cp;
}

function sudo(tag, args, callback) {
    assert(typeof tag === 'string');
    assert(util.isArray(args));
    assert(typeof callback === 'function');

    // -S makes sudo read stdin for password
    var cp = exec(tag, SUDO, [ '-S' ].concat(args), callback);
    cp.stdin.end();
}

