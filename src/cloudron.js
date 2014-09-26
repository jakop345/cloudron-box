/* jslint node: true */

'use strict';

var backups = require('./backups.js'),
    debug = require('debug')('box:cloudron'),
    config = require('../config.js'),
    os = require('os'),
    Updater = require('./updater.js'),
    assert = require('assert'),
    exec = require('child_process').exec,
    util = require('util'),
    path = require('path'),
    superagent = require('superagent');

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    getConfig: getConfig,
    update: update,
    restore: restore,

    // exported for testing
    _getAnnounceTimerId: getAnnounceTimerId
};

var RESTORE_CMD = 'sudo ' + path.join(__dirname, 'scripts/restore.sh');

var backupTimerId = null,
    announceTimerId = null,
    updater = new Updater(); // TODO: make this not an object

function CloudronError(reason, info) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    this.message = !info ? reason : (typeof info === 'object' ? JSON.stringify(info) : info);
}
util.inherits(CloudronError, Error);
CloudronError.INTERNAL_ERROR = 1;


function initialize() {
    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    backupTimerId = setInterval(backups.createBackup, 4 * 60 * 60 * 1000);

    sendHeartBeat();
    announce();

    updater.start();
}

function uninitialize() {
    clearInterval(backupTimerId);
    backupTimerId = null;

    clearTimeout(announceTimerId);
    announceTimerId = null;

    updater.stop();
}

function getAnnounceTimerId() {
    return announceTimerId;
}

function update(callback) {
    assert(typeof callback === 'function');

    updater.update(function (error) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error.message));
        return callback(null);
    });
}

function restore(body, callback) {
    assert(typeof body === 'object');
    assert(typeof callback === 'function');

    var args = [
        body.aws.accessKeyId,
        body.aws.secretAccessKey,
        body.aws.prefix,
        body.aws.bucket,
        body.fileName,
        body.token
    ];

    var restoreCommandLine = RESTORE_CMD + ' ' + args.join(' ');
    debug('_restore: execute "%s".', restoreCommandLine);

    // Finish the request, to let the appstore know we triggered the restore it
    // TODO is there a better way?
    callback(null);

    exec(restoreCommandLine, {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Restore failed.', error, stdout, stderr);
        }

        debug('_restore: success');
    });
}

function getIp() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        if (dev.match(/^(en|eth).*/) === null) continue;

        for (var i = 0; i < ifaces[dev].length; i++) {
            if (ifaces[dev][i].family === 'IPv4') return ifaces[dev][i].address;
        }
    }

    return null;
};

function getConfig(callback) {
    assert(typeof callback === 'function');

    var gitRevisionCommand = 'git log -1 --pretty=format:%h';
    exec(gitRevisionCommand, {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Failed to get git revision.', error, stdout, stderr);
            stdout = null;
        }

        callback(null, {
            appServerUrl: config.appServerUrl,
            fqdn: config.fqdn,
            ip: getIp(),
            version: config.version,
            revision: stdout,
            update: updater.availableUpdate()
        })
    });
}

function sendHeartBeat() {
    var HEARTBEAT_INTERVAL = 1000 * 60;

    if (!config.appServerUrl) {
        debug('No appstore server url set. Not sending heartbeat.');
        return;
    }

    if (!config.token) {
        debug('No appstore server token set. Not sending heartbeat.');
        return;
    }

    var url = config.appServerUrl + '/api/v1/boxes/' + os.hostname() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    superagent.get(url).query({ token: config.token }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successfull');

        setTimeout(sendHeartBeat, HEARTBEAT_INTERVAL);
    });
};

function announce() {
    if (config.token) {
        debug('_announce: we already have a token %s. Skip announcing.', config.token);
        clearTimeout(announceTimerId);
        announceTimerId = null;
        return;
    }

    var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = config.appServerUrl + '/api/v1/boxes/' + hostname + '/announce';
    debug('_announce: box with %s.', url);

    superagent.get(url).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('_announce: unable to announce to app server, try again.', error);
            announceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL); // try again
            return;
        }

        announceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL * 2);

        debug('_announce: success');
    });
};

