'use strict';

var assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('shell.js'),
    util = require('util');

exports = module.exports = {
    sudo: sudo
};

var SUDO = '/usr/bin/sudo';

function exec(tag, file, args, callback) {
    assert(typeof tag === 'string');
    assert(typeof file === 'string');
    assert(util.isArray(args));
    assert(typeof callback === 'function');

    var options = { timeout: 0, encoding: 'utf8' };

    child_process.execFile(file, args, options, function (error, stdout, stderr) {
        debug(tag + ' execFile: %s %s', file, args.join(' '));
        debug(tag + ' (stdout): %s', stdout.toString('utf8'));
        debug(tag + ' (stderr): %s', stderr.toString('utf8'));

        if (error) debug(tag + ' code: %s, signal: %s', error.code, error.signal);

        callback(error);
    });
}


function sudo(tag, args, callback) {
    assert(typeof tag === 'string');
    assert(util.isArray(args));
    assert(typeof callback === 'function');

    exec(tag, SUDO, args, callback);
}

