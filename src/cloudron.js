/* jslint node: true */

'use strict';

var debug = require('debug')('box:cloudron'),
    config = require('../config.js'),
    os = require('os'),
    Updater = require('./updater.js'),
    assert = require('assert'),
    execFile = require('child_process').execFile,
    util = require('util'),
    path = require('path'),
    fs = require('fs'),
    paths = require('./paths.js'),
    clientdb = require('./clientdb.js'),
    uuid = require('node-uuid'),
    safe = require('safetydance'),
    _ = require('underscore'),
    Docker = require('dockerode'),
    superagent = require('superagent');

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    getConfig: getConfig,
    update: update,
    backup: backup,
    restore: restore,
    provision: provision,

    getBackupUrl: getBackupUrl,

    getIp: getIp,

    // exported for testing
    _getAnnounceTimerId: getAnnounceTimerId
};

var SUDO = '/usr/bin/sudo',
    TAR = os.platform() === 'darwin' ? '/usr/bin/tar' : '/bin/tar',
    RESTORE_CMD = path.join(__dirname, 'scripts/restore.sh'),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    BACKUP_CMD = path.join(__dirname, 'scripts/backup.sh'),
    GIT = '/usr/bin/git';

var backupTimerId = null,
    announceTimerId = null,
    addMailDnsRecordsTimerId = null,
    getCertificateTimerId = null,
    cachedIp = null,
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
CloudronError.ALREADY_PROVISIONED = 2;

function initialize() {
    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    backupTimerId = setInterval(backup, 4 * 60 * 60 * 1000);

    startServices();

    sendHeartBeat();
    announce();

    addMailDnsRecords();

    updater.start();
}

function uninitialize() {
    clearInterval(backupTimerId);
    backupTimerId = null;

    clearTimeout(announceTimerId);
    announceTimerId = null;

    clearTimeout(addMailDnsRecordsTimerId);
    addMailDnsRecordsTimerId = null;

    clearTimeout(getCertificateTimerId);
    getCertificateTimerId = null;

    cachedIp = null;

    updater.stop();
}

function startServices() {
    var docker = null;

    if (process.env.NODE_ENV === 'test') {
        docker = new Docker({ host: 'http://localhost', port: 5687 });
    } else if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 2375 });
    }
    docker.getContainer('graphite').start({ }, function (error, data) {
        if (error && error.statusCode !== 304) return debug('Failed to start graphite container');

        debug('started graphite');
    });
    docker.getContainer('haraka').start({ }, function (error, data) {
        if (error && error.statusCode !== 304) return debug('Failed to start haraka container');

        debug('started haraka');
    });
}

function getAnnounceTimerId() {
    return announceTimerId;
}

function update(callback) {
    assert(typeof callback === 'function');

    getBackupUrl(function (error, backupUrl) {
        if (error) return callback(error);

        updater.update(backupUrl, function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error.message));
            return callback(null);
        });
    });
}

function getBackupUrl(callback) {
    if (!config.appServerUrl) return new Error('No appstore server url set');
    if (!config.token) return new Error('No appstore server token set');

    var url = config.appServerUrl + '/api/v1/boxes/' + config.fqdn + '/backupurl';

    superagent.put(url).query({ token: config.token }).end(function (error, result) {
        if (error) return new Error('Error getting presigned backup url: ' + error.message);

        if (result.statusCode !== 200 || !result.body || !result.body.url) return new Error('Error getting presigned backup url : ' + result.statusCode);

        return callback(null, result.body.url);
    });
}

function backup() {
    debug('Starting backup script');

    getBackupUrl(function (error, url) {
        if (error) return console.error('Error getting backup url', error);

        debug('backup: url %s', url);

        execFile(SUDO, [ BACKUP_CMD,  url ], { }, function (error) {
            if (error) console.error('Error starting backup command', error);
        });
    });
}

function getIp() {
    if (cachedIp) return cachedIp;

    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        if (dev.match(/^(en|eth|wlp).*/) === null) continue;

        for (var i = 0; i < ifaces[dev].length; i++) {
            if (ifaces[dev][i].family === 'IPv4') {
                cachedIp = ifaces[dev][i].address;
                return cachedIp;
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
            appServerUrl: config.appServerUrl,
            isDev: config.isDev,
            fqdn: config.fqdn,
            ip: getIp(),
            version: config.version(),
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

    var url = config.appServerUrl + '/api/v1/boxes/' + config.fqdn + '/heartbeat';
    debug('Sending heartbeat ' + url);

    superagent.get(url).query({ token: config.token }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successful');

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

function sendMailDnsRecordsRequest(callback) {
    var DKIM_SELECTOR = 'mail';
    var DMARC_REPORT_EMAIL = 'girish@forwardbias.in';

    var dkimPublicKeyFile = path.join(paths.HARAKA_CONFIG_DIR, 'dkim/' + config.fqdn + '/public');
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
        .post(config.appServerUrl + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .query({ token: config.token })
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
    if (!config.token) return;

    if (config.get('mailDnsRecordIds').length !== 0) return; // already registered

    sendMailDnsRecordsRequest(function (error, ids) {
        if (error) {
            console.error('Mail DNS record addition failed', error);
            addMailDnsRecordsTimerId = setTimeout(addMailDnsRecords, 30000);
            return;
        }

        debug('Added Mail DNS records successfully');
        config.set('mailDnsRecordIds', ids);
    });
}

function restore(args, callback) {
    assert(typeof args === 'object');
    assert(typeof callback === 'function');

    if (config.token) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));

    config.set(_.pick(args, 'token', 'appServerUrl', 'adminOrigin', 'fqdn', 'isDev'));

    debug('restore: sudo restore.sh %s %s', args.restoreUrl, args.token);

    // override the default webadmin OAuth client record
    var scopes = 'root,profile,users,apps,settings,roleAdmin';
    clientdb.replaceByAppId(uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin, scopes, function (error) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        installCertificate(args.tls.cert, args.tls.key, function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            addMailDnsRecords();

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

    if (config.token) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));

    config.set(_.pick(args, 'token', 'appServerUrl', 'adminOrigin', 'fqdn', 'isDev'));

    // override the default webadmin OAuth client record
    var scopes = 'root,profile,users,apps,settings,roleAdmin';
    clientdb.replaceByAppId(uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin, scopes, function (error) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        installCertificate(args.tls.cert, args.tls.key, callback);

        addMailDnsRecords();
    });
}

