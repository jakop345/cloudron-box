/* jslint node: true */

'use strict';

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    getConfig: getConfig,
    backup: backup,

    getBackupUrl: getBackupUrl,

    getIp: getIp
};

var assert = require('assert'),
    config = require('../config.js'),
    debug = require('debug')('box:cloudron'),
    clientdb = require('./clientdb.js'),
    execFile = require('child_process').execFile,
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    superagent = require('superagent'),
    updater = require('./updater.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    _ = require('underscore');

var SUDO = '/usr/bin/sudo',
    TAR = os.platform() === 'darwin' ? '/usr/bin/tar' : '/bin/tar',
    BACKUP_CMD = path.join(__dirname, 'scripts/backup.sh'),
    GIT = '/usr/bin/git';

var gBackupTimerId = null,
    gAddMailDnsRecordsTimerId = null,
    gGetCertificateTimerId = null,
    gCachedIp = null;

function CloudronError(reason, info) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    this.message = !info ? reason : (typeof info === 'object' ? JSON.stringify(info) : info);
}
util.inherits(CloudronError, Error);
CloudronError.INTERNAL_ERROR = 1;
CloudronError.ALREADY_PROVISIONED = 2;
CloudronError.APPSTORE_DOWN = 3;

function initialize() {
    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    gBackupTimerId = setInterval(backup, 4 * 60 * 60 * 1000);

    sendHeartBeat();

    addMailDnsRecords();
}

function uninitialize() {
    clearInterval(gBackupTimerId);
    gBackupTimerId = null;

    clearTimeout(gAddMailDnsRecordsTimerId);
    gAddMailDnsRecordsTimerId = null;

    clearTimeout(gGetCertificateTimerId);
    gGetCertificateTimerId = null;

    gCachedIp = null;
}

function getBackupUrl(callback) {
    if (!config.appServerUrl()) return new Error('No appstore server url set');
    if (!config.token()) return new Error('No appstore server token set');

    var url = config.appServerUrl() + '/api/v1/boxes/' + config.fqdn() + '/backupurl';

    superagent.put(url).query({ token: config.token(), boxVersion: config.version() }).end(function (error, result) {
        if (error) return new Error('Error getting presigned backup url: ' + error.message);

        if (result.statusCode !== 200 || !result.body || !result.body.url) return new Error('Error getting presigned backup url : ' + result.statusCode);

        return callback(null, result.body.url);
    });
}

function backup(callback) {
    assert(typeof callback === 'function');

    getBackupUrl(function (error, url) {
        if (error) return callback(new CloudronError(CloudronError.APPSTORE_DOWN, error.message));

        debug('backup: url %s', url);

        execFile(SUDO, [ BACKUP_CMD,  url ], { }, function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'Error starting backup command: ' + error.message));

            return callback(null);
        });
    });
}

function getIp() {
    if (gCachedIp) return gCachedIp;

    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        if (dev.match(/^(en|eth|wlp).*/) === null) continue;

        for (var i = 0; i < ifaces[dev].length; i++) {
            if (ifaces[dev][i].family === 'IPv4') {
                gCachedIp = ifaces[dev][i].address;
                return gCachedIp;
            }
        }
    }

    return null;
};

function getConfig(callback) {
    assert(typeof callback === 'function');

    execFile(GIT, [ 'log', '-1', '--pretty=format:%h' ], {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Failed to get git revision.', error, stdout, stderr);
            stdout = null;
        }

        callback(null, {
            appServerUrl: config.appServerUrl(),
            isDev: config.get('isDev'),
            fqdn: config.fqdn(),
            ip: getIp(),
            version: config.version(),
            revision: stdout,
            update: updater.getUpdateInfo()
        })
    });
}

function sendHeartBeat() {
    var HEARTBEAT_INTERVAL = 1000 * 60;

    if (!config.appServerUrl()) {
        debug('No appstore server url set. Not sending heartbeat.');
        return;
    }

    if (!config.token()) {
        debug('No appstore server token set. Not sending heartbeat.');
        return;
    }

    var url = config.appServerUrl() + '/api/v1/boxes/' + config.fqdn() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    superagent.get(url).query({ token: config.token() }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successful');

        setTimeout(sendHeartBeat, HEARTBEAT_INTERVAL);
    });
};

function sendMailDnsRecordsRequest(callback) {
    var DKIM_SELECTOR = 'mail';
    var DMARC_REPORT_EMAIL = 'girish@forwardbias.in';

    var dkimPublicKeyFile = path.join(paths.HARAKA_CONFIG_DIR, 'dkim/' + config.fqdn() + '/public');
    var publicKey = safe.fs.readFileSync(dkimPublicKeyFile, 'utf8');

    if (publicKey === null) return console.error('Error reading dkim public key');

    // remove header, footer and new lines
    publicKey = publicKey.split('\n').slice(1, -2).join('');

    // note that dmarc requires special DNS records for external RUF and RUA
    var records = [
        // softfail all mails not from our IP. Note that this uses IP instead of 'a' should we use a load balancer in the future
        { subdomain: '', type: 'TXT', value: '"v=spf1 ip4:' + getIp() + ' ~all"' },
        // t=s limits the domainkey to this domain and not it's subdomains
        { subdomain: DKIM_SELECTOR + '._domainkey', type: 'TXT', value: '"v=DKIM1; t=s; p=' + publicKey + '"' },
        // DMARC requires special setup if report email id is in different domain
        { subdomain: '_dmarc', type: 'TXT', value: '"v=DMARC1; p=none; pct=100; rua=mailto:' + DMARC_REPORT_EMAIL + '; ruf=' + DMARC_REPORT_EMAIL + '"' }
    ];

    debug('sendMailDnsRecords request:%s', JSON.stringify(records));

    superagent
        .post(config.appServerUrl() + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .query({ token: config.token() })
        .send({ records: records })
        .end(function (error, res) {
            if (error) return callback(error);

            debug('sendMailDnsRecords status:' + res.status);

            if (res.status === 409) return callback(null); // already registered

            if (res.status !== 201) return callback(new Error('Failed to add Mail DNS records: ' + res.status));

            return callback(null, res.body.ids);
        });
}

function addMailDnsRecords() {
    if (!config.token()) {
        // TODO: when we separate out the installer we should assert on token instead
        gAddMailDnsRecordsTimerId = setTimeout(addMailDnsRecords, 30000);
        return;
    }

    if (config.get('mailDnsRecordIds').length !== 0) return; // already registered

    sendMailDnsRecordsRequest(function (error, ids) {
        if (error) {
            console.error('Mail DNS record addition failed', error);
            gAddMailDnsRecordsTimerId = setTimeout(addMailDnsRecords, 30000);
            return;
        }

        debug('Added Mail DNS records successfully');
        config.set('mailDnsRecordIds', ids);
    });
}

