'use strict';

var assert = require('assert'),
    async = require('async'),
    authcodedb = require('./authcodedb.js'),
    backups = require('./backups.js'),
    debug = require('debug')('box:src/janitor'),
    docker = require('./docker.js').connection,
    settings = require('./settings.js'),
    tokendb = require('./tokendb.js');

exports = module.exports = {
    cleanupTokens: cleanupTokens,
    cleanupDockerVolumes: cleanupDockerVolumes,
    cleanupBackups: cleanupBackups
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

function cleanupBackups(callback) {
    assert(!callback || typeof callback === 'function'); // callback is null when called from cronjob

    callback = callback || NOOP_CALLBACK;

    debug('Cleaning backups');

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(error);

        // nothing to do here
        if (backupConfig.provider !== 'filesystem') return callback();

        backups.getPaged(1, 1000, function (error, result) {
            if (error) return callback(error);

            var TIME_OFFSET = 1000 * 60 * 60 * 24 * 2; // 2 days = 2 backups
            var TIME_THRESHOLD = Date.now() - TIME_OFFSET;

            var toCleanup = result.filter(function (backup) { return backup.creationTime.getTime() <= TIME_THRESHOLD; });

            debug('cleanupBackups: about to clean: ', toCleanup);

            async.each(toCleanup, function (backup, callback) {
                backups.removeBackup(backup.id, backup.dependsOn, function (error) {
                    if (error) console.error(error);

                    debug('cleanupBackups: %s, %s done', backup.id, backup.dependsOn.join(', '));

                    callback();
                });
            }, callback);
        });
    });
}
