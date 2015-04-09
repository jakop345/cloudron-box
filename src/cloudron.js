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
    backupApp: backupApp,
    restoreApp: restoreApp,

    getBackupUrl: getBackupUrl,
    setCertificate: setCertificate,

    getIp: getIp
};

var addons = require('./addons.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    debug = require('debug')('box:cloudron'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    safe = require('safetydance'),
    superagent = require('superagent'),
    tokendb = require('./tokendb.js'),
    updater = require('./updater.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    userdb = require('./userdb.js'),
    util = require('util');

var SUDO = '/usr/bin/sudo',
    BACKUP_BOX_CMD = path.join(__dirname, 'scripts/backupbox.sh'),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    BACKUP_APP_CMD = path.join(__dirname, 'scripts/backupapp.sh'),
    RESTORE_APP_CMD = path.join(__dirname, 'scripts/restoreapp.sh');

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
CloudronError.BAD_USERNAME = 'Bad username';
CloudronError.BAD_EMAIL = 'Bad email';
CloudronError.BAD_PASSWORD = 'Bad password';

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

function execFile(tag, file, args, callback) {
    assert(typeof tag === 'string');
    assert(typeof file === 'string');
    assert(util.isArray(args));
    assert(typeof callback === 'function');

    var options = { timeout: 0, encoding: 'utf8' };

    child_process.execFile(file, args, options, function (error, stdout, stderr) {
        debug(tag + ' execFile: %s %s', file, args.join(' '));
        debug(tag + ' (stdout): %s', stdout);
        debug(tag + ' (stderr): %s', stderr);

        callback(error);
    });
}

function activate(username, password, email, callback) {
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof email === 'string');
    assert(typeof callback === 'function');

    debug('activating user:%s email:%s', username, email);

    userdb.count(function (error, count) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));
        if (count !== 0) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));


        user.create(username, password, email, true /* admin */, function (error, userObject) {
            if (error) {
                if (error.reason === UserError.ALREADY_EXISTS) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));
                if (error.reason === UserError.BAD_USERNAME) return callback(new CloudronError(CloudronError.BAD_USERNAME));
                if (error.reason === UserError.BAD_PASSWORD) return callback(new CloudronError(CloudronError.BAD_PASSWORD));
                if (error.reason === UserError.BAD_EMAIL) return callback(new CloudronError(CloudronError.BAD_EMAIL));

                return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));
            }

            clientdb.getByAppId('webadmin', function (error, result) {
                if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                // Also generate a token so the admin creation can also act as a login
                var token = tokendb.generateToken();
                var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

                tokendb.add(token, tokendb.PREFIX_USER + userObject.id, result.id, expires, '*', function (error) {
                    if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                    callback(null, { token: token, expires: expires });
                });
            });
        });
    });
}

function getBackupUrl(appId, appBackupIds, callback) {
    assert(!appId || typeof appId === 'string');
    assert(!appBackupIds || util.isArray(appBackupIds));
    assert(typeof callback === 'function');

    if (config.LOCAL) return callback(null, {});    // skip this when running locally

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backupurl';

    superagent.put(url).query({ token: config.token() }).send({ boxVersion: config.version(), appId: appId, appBackupIds: appBackupIds }).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned backup url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned backup url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function getRestoreUrl(backupId, callback) {
    assert(typeof backupId === 'string');
    assert(typeof callback === 'function');

    if (config.LOCAL) return callback(null, {});    // skip this when running locally

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/restoreurl';

    superagent.put(url).query({ token: config.token(), backupId: backupId }).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned download url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned download url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function restoreApp(app, callback) {
    if (!app.lastBackupId) {
        debug('No existing backup to return to. Skipping %d', app.id);
        return callback(null);
    }

   getRestoreUrl(app.lastBackupId, function (error, result) {
        if (error) return callback(error);

        debug('restoreApp: %s (%s) app url:%s', app.id, app.manifest.title, result.url);

        execFile('restoreApp', SUDO, [ RESTORE_APP_CMD,  app.id, result.url, result.backupKey ], function (error, stdout, stderr) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'Error backing up : ' + stderr));

            callback(null);
        });
    });
}

function backupApp(app, callback) {
    if (!safe.fs.writeFileSync(path.join(paths.DATA_DIR, app.id + '/config.json'), JSON.stringify(app))) {
        return callback(safe.error);
    }

    addons.backupAddons(app, function (error) {
        if (error) return callback(error);

        getBackupUrl(app.id, null, function (error, result) {
            if (error) return callback(error);

            debug('backupApp: %s (%s) app url:%s id:%s', app.id, app.manifest.title, result.url, result.id);

            execFile('backupApp', SUDO, [ BACKUP_APP_CMD,  app.id, result.url, result.backupKey ], function (error, stdout, stderr) {
                if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'Error backing up : ' + stderr));

                debug('backupApp: %s (%s) successful', app.id, app.manifest.title);

                apps.setLastBackupId(app.id, result.id, callback.bind(null, null, result.id));
            });
        });
    });
}

function backupBox(appBackupIds, callback) {
    assert(util.isArray(appBackupIds));

    getBackupUrl(null /* appId */, appBackupIds, function (error, result) {
        if (error) return callback(new CloudronError(CloudronError.APPSTORE_DOWN, error.message));

        debug('backup: url %s', result.url);

        execFile('backupBox', SUDO, [ BACKUP_BOX_CMD,  result.url, result.backupKey ], function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            debug('backup: successful');

            callback(null);
        });
    });
}

function backup(callback) {
    callback = callback || function () { }; // callback can be empty for timer triggered backup

    apps.getAll(function (error, allApps) {
        if (error) return callback(error);

        async.mapSeries(allApps, backupApp, function appsBackedUp(error, backupIds) {
            if (error) return callback(error);

            backupBox(backupIds, callback);
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
}

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
        apiServerOrigin: config.apiServerOrigin(),
        webServerOrigin: config.webServerOrigin(),
        isDev: /dev/i.test(config.get('boxVersionsUrl')) || config.LOCAL,
        fqdn: config.fqdn(),
        ip: getIp(),
        version: config.version(),
        update: updater.getUpdateInfo(),
        progress: progress.get(),
        isCustomDomain: config.isCustomDomain(),
        developerMode: config.developerMode()
    });
}

function sendHeartBeat() {
    var HEARTBEAT_INTERVAL = 1000 * 60;

    if (!config.apiServerOrigin()) {
        debug('No appstore server url set. Not sending heartbeat.');
        return;
    }

    // skip this when running locally
    if (config.LOCAL) {
        debug('No appstore server token set. Not sending heartbeat.');
        return;
    }

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    // TODO: this must be a POST
    superagent.get(url).query({ token: config.token(), version: config.version() }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successful');

        setTimeout(sendHeartBeat, HEARTBEAT_INTERVAL);
    });
}

function sendMailDnsRecordsRequest(callback) {
    assert(typeof callback === 'function');

    var DKIM_SELECTOR = 'mail';
    var DMARC_REPORT_EMAIL = 'dmarc-report@cloudron.io';

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
        .post(config.apiServerOrigin() + '/api/v1/subdomains')
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
    if (config.LOCAL) return;   // skip this when running locally
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
    assert(typeof callback === 'function');

    debug('Updating certificates');

    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), certificate)) {
        return callback(new CloudronError(CloudronError.INTERNAL_ERROR, safe.error.message));
    }

    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), key)) {
        return callback(new CloudronError(CloudronError.INTERNAL_ERROR, safe.error.message));
    }

    execFile('setCertificate', SUDO, [ RELOAD_NGINX_CMD ], function (error) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        return callback(null);
    });
}
