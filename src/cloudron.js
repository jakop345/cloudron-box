/* jslint node: true */

'use strict';

// intentionally placed here because of circular dep with updater
exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    activate: activate,
    getConfig: getConfig,
    getStatus: getStatus,
    backup: backup,

    getBackupUrl: getBackupUrl,
    setCertificate: setCertificate,

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
    tokendb = require('./tokendb.js'),
    updater = require('./updater.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    userdb = require('./userdb.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    _ = require('underscore');

var SUDO = '/usr/bin/sudo',
    TAR = os.platform() === 'darwin' ? '/usr/bin/tar' : '/bin/tar',
    BACKUP_CMD = path.join(__dirname, 'scripts/backup.sh'),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh');

var gBackupTimerId = null,
    gAddMailDnsRecordsTimerId = null,
    gGetCertificateTimerId = null,
    gCachedIp = null;

function CloudronError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(CloudronError, Error);
CloudronError.BAD_FIELD = 'Field error';
CloudronError.INTERNAL_ERROR = 'Internal Error';
CloudronError.ALREADY_PROVISIONED = 'Already Provisioned';
CloudronError.APPSTORE_DOWN = 'Appstore Down';

function initialize(callback) {
    assert(typeof callback === 'function');

    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    gBackupTimerId = setInterval(backup, 4 * 60 * 60 * 1000);

    sendHeartBeat();

    if (process.env.NODE_ENV !== 'test') {
        addMailDnsRecords();
    }

    callback(null);
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    clearInterval(gBackupTimerId);
    gBackupTimerId = null;

    clearTimeout(gAddMailDnsRecordsTimerId);
    gAddMailDnsRecordsTimerId = null;

    clearTimeout(gGetCertificateTimerId);
    gGetCertificateTimerId = null;

    gCachedIp = null;

    callback(null);
}

function activate(username, password, email, callback) {
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof email === 'string');
    assert(typeof callback === 'function');

    debug('activating user:%s email:%s', username, email);

    user.create(username, password, email, true /* admin */, function (error) {
        if (error && error.reason === UserError.ALREADY_EXISTS) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));
        if (error && error instanceof UserError) return callback(error);
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        clientdb.getByAppId('webadmin', function (error, result) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            // Also generate a token so the admin creation can also act as a login
            var token = tokendb.generateToken();
            var expires = new Date(Date.now() + 60 * 60000).toUTCString(); // 1 hour

            tokendb.add(token, username, result.id, expires, '*', function (error) {
                if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                callback(null, { token: token, expires: expires });
            });
        });
    });
}

function getBackupUrl(callback) {
    assert(typeof callback === 'function');

    if (!config.appServerUrl()) return callback(new Error('No appstore server url set'));
    if (!config.token()) return callback(new Error('No appstore server token set'));

    var url = config.appServerUrl() + '/api/v1/boxes/' + config.fqdn() + '/backupurl';

    superagent.put(url).query({ token: config.token(), boxVersion: config.version() }).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned backup url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned backup url : ' + result.statusCode));

        return callback(null, result.body.url);
    });
}

function backup(callback) {
    assert(typeof callback === 'function');

    getBackupUrl(function (error, url) {
        if (error) return callback(new CloudronError(CloudronError.APPSTORE_DOWN, error.message));

        debug('backup: url %s', url);

        execFile(SUDO, [ BACKUP_CMD,  url ], { }, function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

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

function getStatus(callback) {
    assert(typeof callback === 'function');

    userdb.count(function (error, count) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        callback(null, { activated: count !== 0, version: config.version() });
    });
}

function getConfig(callback) {
    assert(typeof callback === 'function');

    callback(null, {
        appServerUrl: config.appServerUrl(),
        isDev: /dev/i.test(config.get('boxVersionsUrl')),
        fqdn: config.fqdn(),
        ip: getIp(),
        version: config.version(),
        update: updater.getUpdateInfo()
    })
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

    superagent.get(url).query({ token: config.token(), version: config.version() }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successful');

        setTimeout(sendHeartBeat, HEARTBEAT_INTERVAL);
    });
};

function sendMailDnsRecordsRequest(callback) {
    assert(typeof callback === 'function');

    var DKIM_SELECTOR = 'mail';
    var DMARC_REPORT_EMAIL = 'girish@forwardbias.in';

    var dkimPublicKeyFile = path.join(paths.MAIL_DATA_DIR, 'dkim/' + config.fqdn() + '/public');
    var publicKey = safe.fs.readFileSync(dkimPublicKeyFile, 'utf8');

    if (publicKey === null) return callback(new Error('Error reading dkim public key'));

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

            debug('sendMailDnsRecords status: %s', res.status);

            if (res.status === 409) return callback(null); // already registered

            if (res.status !== 201) return callback(new Error(util.format('Failed to add Mail DNS records: %s %j', res.status, res.body)));

            return callback(null, res.body.ids);
        });
}

function addMailDnsRecords() {
    // TODO assert replaced with a non fatal return, for local development
    if (!config.token()) return;

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

function setCertificate(certificate, key, callback) {
    assert(typeof certificate === 'string');
    assert(typeof key === 'string');

    debug('Updating certificates');

    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), certificate)) {
        return callback(new CloudronError(CloudronError.INTERNAL_ERROR, safe.error.message));
    }

    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), key)) {
        return callback(new CloudronError(CloudronError.INTERNAL_ERROR, safe.error.message));
    }

    execFile(SUDO, [ RELOAD_NGINX_CMD ], { timeout: 10000 }, function (error) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

