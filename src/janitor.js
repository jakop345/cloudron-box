'use strict';

var assert = require('assert'),
    async = require('async'),
    authcodedb = require('./authcodedb.js'),
    debug = require('debug')('box:src/janitor'),
    docker = require('./docker.js'),
    tokendb = require('./tokendb.js');

exports = module.exports = {
    cleanupTokens: cleanupTokens,
    cleanupDockerVolumes: cleanupDockerVolumes
};

function ignoreError(func) {
    return function (callback) {
        func(function (error) {
            if (error) console.error('Ignored error:', error);

            callback();
        });
    };
}

function cleanupExpiredTokens(callback) {
    assert.strictEqual(typeof callback, 'function');

    tokendb.delExpired(function (error, result) {
        if (error) return callback(error);

        debug('Cleaned up %s expired tokens.', result);

        callback(null);
    });
}

function cleanupExpiredAuthCodes(callback) {
    assert.strictEqual(typeof callback, 'function');

    authcodedb.delExpired(function (error, result) {
        if (error) return callback(error);

        debug('Cleaned up %s expired authcodes.', result);

        callback(null);
    });
}

function cleanupTokens(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Cleaning up expired tokens');

    async.series([
        ignoreError(cleanupExpiredTokens),
        ignoreError(cleanupExpiredAuthCodes)
    ], callback);
}

function cleanupTmpVolume(containerId, callback) {
    assert.strictEqual(typeof containerId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var cmd = 'find /tmp -mtime +10 -exec rm -rf {} +'.split(' '); // 10 days old

    debug('cleanupTmpVolume %s', containerId);

    docker.getContainer(containerId).exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true, Tty: false }, function (error, execContainer) {
        if (error) {
            debug('Failed to exec container : %s', error.message);
            return callback(); // intentionally ignore error
        }

        execContainer.start(function(err, stream) {
            if (error) {
                debug('Failed to start exec container : %s', error.message);
                return callback(); // intentionally ignore error
            }

            stream.on('error', callback);
            stream.on('end', callback);

            stream.setEncoding('utf8');
            stream.pipe(process.stdout);
        });
    });
}

function cleanupDockerVolumes(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Cleaning up docker volumes');

    docker.listContainers(function (error, containers) {
        if (error) return callback(error);

        async.eachSeries(containers, function (containerInfo, iteratorDone) {
            cleanupTmpVolume(containerInfo.Id, iteratorDone);
        }, callback);
    });
}
