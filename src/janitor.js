'use strict';

var assert = require('assert'),
    async = require('async'),
    authcodedb = require('./authcodedb.js'),
    debug = require('debug')('box:src/janitor'),
    docker = require('./docker.js').connection,
    tokendb = require('./tokendb.js');

exports = module.exports = {
    cleanupTokens: cleanupTokens,
    cleanupDockerVolumes: cleanupDockerVolumes
};

var NOOP_CALLBACK = function () { };

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
    assert(!callback || typeof callback === 'function'); // callback is null when called from cronjob

    debug('Cleaning up expired tokens');

    async.series([
        ignoreError(cleanupExpiredTokens),
        ignoreError(cleanupExpiredAuthCodes)
    ], callback);
}

function cleanupTmpVolume(containerInfo, callback) {
    assert.strictEqual(typeof containerInfo, 'object');
    assert.strictEqual(typeof callback, 'function');

    var cmd = 'find /tmp -mtime +10 -exec rm -rf {} +'.split(' '); // 10 days old

    debug('cleanupTmpVolume %j', containerInfo.Names);

    docker.getContainer(containerInfo.Id).exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true, Tty: false }, function (error, execContainer) {
        if (error) return callback(new Error('Failed to exec container : ' + error.message));

        execContainer.start(function(err, stream) {
            if (error) return callback(new Error('Failed to start exec container : ' + error.message));

            stream.on('error', callback);
            stream.on('end', callback);

            stream.setEncoding('utf8');
            stream.pipe(process.stdout);
        });
    });
}

function cleanupDockerVolumes(callback) {
    assert(!callback || typeof callback === 'function'); // callback is null when called from cronjob

    callback = callback || NOOP_CALLBACK;

    debug('Cleaning up docker volumes');

    docker.listContainers({ all: 0 }, function (error, containers) {
        if (error) return callback(error);

        async.eachSeries(containers, function (container, iteratorDone) {
            cleanupTmpVolume(container, function (error) {
                if (error) debug('Error cleaning tmp: %s', error);

                iteratorDone(); // intentionally ignore error
            });
        }, callback);
    });
}
