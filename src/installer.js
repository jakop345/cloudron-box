/* jslint node: true */

'use strict';

var assert = require('assert'),
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    debug = require('debug')('box/installer'),
    execFile = require('child_process').execFile,
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    superagent = require('superagent'),
    util = require('util'),
    uuid = require('node-uuid'),
    _ = require('underscore');

exports = module.exports = {
    InstallerError: InstallerError,

    initialize: initialize,
    uninitialize: uninitialize,

    provision: provision,
    restore: restore,

    // exported for testing
    _getAnnounceTimerId: getAnnounceTimerId
};

var gAnnounceTimerId = null;

var SUDO = '/usr/bin/sudo',
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    RESTORE_CMD = path.join(__dirname, 'scripts/restore.sh');
 
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
    announce();
}

function uninitialize() {
    clearTimeout(gAnnounceTimerId);
    gAnnounceTimerId = null;
}

function getAnnounceTimerId() {
    return gAnnounceTimerId;
}

function announce() {
    if (config.token()) {
        debug('_announce: we already have a token %s. Skip announcing.', config.token());
        clearTimeout(gAnnounceTimerId);
        gAnnounceTimerId = null;
        return;
    }

    var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = config.appServerUrl() + '/api/v1/boxes/' + hostname + '/announce';
    debug('_announce: box with %s.', url);

    superagent.get(url).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('_announce: unable to announce to app server, try again.', error);
            gAnnounceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL); // try again
            return;
        }

        gAnnounceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL * 2);

        debug('_announce: success');
    });
};

function installCertificate(cert, key, callback) {
    assert(typeof cert === 'string' || !cert);
    assert(typeof key === 'string' || !key);
    assert(typeof callback === 'function');

    var certDirPath = paths.NGINX_CERT_DIR;

    if (!cert || !key) return callback(new Error('cert or key is null'));

    if (!safe.fs.writeFileSync(path.join(certDirPath, 'host.cert'), cert)) return callback(new Error('Cannot write host.cert:' + safe.error));
    if (!safe.fs.writeFileSync(path.join(certDirPath, 'host.key'), key)) return callback(new Error('Cannot write host.key:' + safe.error));

    execFile(SUDO, [ RELOAD_NGINX_CMD ], { timeout: 10000 }, function (error) {
        if (error) return callback(error);

        debug('_getCertificate: success');

        callback(null);
    });
}

function restore(args, callback) {
    assert(typeof args === 'object');
    assert(typeof callback === 'function');

    if (config.token()) return callback(new InstallerError(InstallerError.ALREADY_PROVISIONED));

    config.set(_.pick(args, 'token', 'appServerUrl', 'fqdn', 'isDev'));

    debug('restore: sudo restore.sh %s %s', args.restoreUrl, args.token);

    // override the default webadmin OAuth client record
    var scopes = 'root,profile,users,apps,settings,roleAdmin';
    clientdb.replaceByAppId(uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin(), scopes, function (error) {
        if (error) return callback(new InstallerError(InstallerError.INTERNAL_ERROR, error));

        installCertificate(args.tls.cert, args.tls.key, function (error) {
            if (error) return callback(new InstallerError(InstallerError.INTERNAL_ERROR, error));

            callback(null); // finish request to let appstore know

            execFile(SUDO, [ RESTORE_CMD, args.restoreUrl ], { }, function (error, stdout, stderr) {
                if (error) console.error('Restore failed.', error, stdout, stderr);

                debug('_restore: success');
            });
        });
    });
}

function provision(args, callback) {
    assert(typeof args === 'object');
    assert(typeof callback === 'function');

    if (config.token()) return callback(new InstallerError(InstallerError.ALREADY_PROVISIONED));

    config.set(_.pick(args, 'token', 'appServerUrl', 'fqdn', 'isDev'));

    // override the default webadmin OAuth client record
    var scopes = 'root,profile,users,apps,settings,roleAdmin';
    clientdb.replaceByAppId(uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin(), scopes, function (error) {
        if (error) return callback(new InstallerError(InstallerError.INTERNAL_ERROR, error));

        installCertificate(args.tls.cert, args.tls.key, callback);
    });
}

