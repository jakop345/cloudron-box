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
    fs = require('fs'),
    clientdb = require('./clientdb.js'),
    uuid = require('node-uuid'),
    safe = require('safetydance'),
    _ = require('underscore'),
    superagent = require('superagent');

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    getConfig: getConfig,
    update: update,
    restore: restore,
    provision: provision,

    getIp: getIp,

    // exported for testing
    _getAnnounceTimerId: getAnnounceTimerId
};

var RESTORE_CMD = 'sudo ' + path.join(__dirname, 'scripts/restore.sh'),
    RELOAD_NGINX_CMD = 'sudo ' + path.join(__dirname, 'scripts/reloadnginx.sh');

var backupTimerId = null,
    announceTimerId = null,
    addMailDnsRecordsTimerId = null,
    getCertificateTimerId = null,
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

    clearTimeout(addMailDnsRecordsTimerId);
    addMailDnsRecordsTimerId = null;

    clearTimeout(getCertificateTimerId);
    getCertificateTimerId = null;

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

function sendGetCertificateRequest(callback) {
    assert(typeof callback === 'function');

    debug('_getCertificate');

    if (!config.appServerUrl || !config.token || !config.fqdn) {
        debug('_getCertificate: not provisioned, yet.');
        return callback(new Error('Not provisioned yet'));
    }

    var url = config.appServerUrl + '/api/v1/boxes/' + config.fqdn + '/certificate?token=' + config.token;

    var request = require(config.appServerUrl.indexOf('https://') === 0 ? 'https' : 'http');

    request.get(url, function (result) {
        if (result.statusCode !== 200) return callback(new Error('Failed to get certificate. Status: ' + result.statusCode));

        var certDirPath = config.nginxCertDir;
        var certFilePath = path.join(certDirPath, 'cert.tar');
        var file = fs.createWriteStream(certFilePath);

        result.on('data', function (chunk) {
            file.write(chunk);
        });
        result.on('end', function () {
            exec('tar -xf ' + certFilePath, { cwd: certDirPath }, function(error) {
                if (error) return callback(error);

                if (!fs.existsSync(path.join(certDirPath, 'host.cert'))) return callback(new Error('Certificate bundle does not contain a host.cert file'));
                if (!fs.existsSync(path.join(certDirPath, 'host.info'))) return callback(new Error('Certificate bundle does not contain a host.info file'));
                if (!fs.existsSync(path.join(certDirPath, 'host.key'))) return callback(new Error('Certificate bundle does not contain a host.key file'));
                if (!fs.existsSync(path.join(certDirPath, 'host.pem'))) return callback(new Error('Certificate bundle does not contain a host.pem file'));

                // cleanup the cert bundle
                fs.unlinkSync(certFilePath);

                exec(RELOAD_NGINX_CMD, { timeout: 10000 }, function (error) {
                    if (error) return callback(error);

                    debug('_getCertificate: success');

                    callback(null);
                });
            });
        });
    }).on('error', function (error) {
        callback(error);
    });
}

function sendMailDnsRecordsRequest(callback) {
    var DKIM_SELECTOR = 'mail';
    var DMARC_REPORT_EMAIL = 'girish@forwardbias.in';

    var dkimPublicKeyFile = path.join(config.harakaConfigDir, 'dkim/' + config.fqdn + '/public');
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

            return callback(null);
        });
}

function addMailDnsRecords() {
    sendMailDnsRecordsRequest(function (error) {
        if (error) {
            console.error('Mail DNS record addition failed', error);
            addMailDnsRecordsTimerId = setTimeout(addMailDnsRecords, 30000);
            return;
        }

        debug('Added Mail DNS records successfully');
    });
}

function getCertificate() {
    sendGetCertificateRequest(function (error) {
        if (error) {
            console.error(error);
            getCertificateTimerId = setTimeout(getCertificate, 5000);
            return;
        }
        debug('getCertificate: success');
    });
}

function provision(args, callback) {
    assert(typeof callback === 'function');

    if (config.token) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));

    config.set(_.pick(args, 'token', 'appServerUrl', 'adminOrigin', 'fqdn', 'aws'));

    // override the default webadmin OAuth client record
    clientdb.delByAppId('webadmin', function () {
        clientdb.add(uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin, function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            callback(null);

            // TODO: this needs to work across reboots
            addMailDnsRecords();
            getCertificate();
        });
    });
}

