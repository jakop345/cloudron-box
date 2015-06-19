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

    backupBox: backupBox,
    backupApp: backupApp,

    restoreApp: restoreApp,

    setCertificate: setCertificate,

    sendHeartbeat: sendHeartbeat,

    reboot: reboot,
    migrate: migrate,

    getIp: getIp
};

var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    debug = require('debug')('box:cloudron'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    shell = require('./shell.js'),
    superagent = require('superagent'),
    tokendb = require('./tokendb.js'),
    updater = require('./updater.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    userdb = require('./userdb.js'),
    util = require('util');

var BACKUP_BOX_CMD = path.join(__dirname, 'scripts/backupbox.sh'),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    BACKUP_APP_CMD = path.join(__dirname, 'scripts/backupapp.sh'),
    RESTORE_APP_CMD = path.join(__dirname, 'scripts/restoreapp.sh'),
    REBOOT_CMD = path.join(__dirname, 'scripts/reboot.sh'),
    BACKUP_SWAP_CMD = path.join(__dirname, 'scripts/backupswap.sh');

var gAddMailDnsRecordsTimerId = null,
    gCloudronDetails = null,            // cached cloudron details like region,size...
    gCachedIp = null;

function CloudronError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
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
CloudronError.EXTERNAL_ERROR = 'External Error';
CloudronError.ALREADY_PROVISIONED = 'Already Provisioned';
CloudronError.APPSTORE_DOWN = 'Appstore Down';
CloudronError.BAD_USERNAME = 'Bad username';
CloudronError.BAD_EMAIL = 'Bad email';
CloudronError.BAD_PASSWORD = 'Bad password';
CloudronError.INVALID_STATE = 'Invalid state';
CloudronError.NOT_FOUND = 'Not found';

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? app.location : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

function ignoreError(func) {
    return function (callback) {
        func(function (error) {
            if (error) console.error('Ignored error:', error);
            callback();
        });
    };
}

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (process.env.NODE_ENV !== 'test') {
        addMailDnsRecords();
    }

    // Send heartbeat once we are up and running, this speeds up the Cloudron creation, as otherwise we are bound to the cron.js settings
    sendHeartbeat();

    callback(null);
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    clearTimeout(gAddMailDnsRecordsTimerId);
    gAddMailDnsRecordsTimerId = null;

    gCachedIp = null;

    callback(null);
}

function setTimeZone(ip, callback) {
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('setTimeZone ip:%s', ip);

    superagent.get('http://www.telize.com/geoip/' + ip).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('Failed to get geo location', error);
            return callback(null);
        }

        if (!result.body.timezone) {
            debug('No timezone in geoip response');
            return callback(null);
        }

        debug('Setting timezone to ', result.body.timezone);

        settings.setTimeZone(result.body.timezone, callback);
    });
}

function activate(username, password, email, ip, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('activating user:%s email:%s', username, email);

    setTimeZone(ip, function () { });

    user.createOwner(username, password, email, function (error, userObject) {
        if (error && error.reason === UserError.ALREADY_EXISTS) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));
        if (error && error.reason === UserError.BAD_USERNAME) return callback(new CloudronError(CloudronError.BAD_USERNAME));
        if (error && error.reason === UserError.BAD_PASSWORD) return callback(new CloudronError(CloudronError.BAD_PASSWORD));
        if (error && error.reason === UserError.BAD_EMAIL) return callback(new CloudronError(CloudronError.BAD_EMAIL));
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

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
}

function getBackupUrl(app, appBackupIds, callback) {
    assert(!app || typeof app === 'object');
    assert(!appBackupIds || util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backupurl';

    var data = {
        boxVersion: config.version(),
        appId: app ? app.id : null,
        appVersion: app ? app.manifest.version : null,
        appBackupIds: appBackupIds
    };

    superagent.put(url).query({ token: config.token() }).send(data).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned backup url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned backup url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function getRestoreUrl(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/restoreurl';

    superagent.put(url).query({ token: config.token(), backupId: backupId }).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned download url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned download url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function restoreApp(app, callback) {
    if (!app.lastBackupId) {
        debugApp(app, 'No existing backup to return to. Proceeding to setup addons');
        return addons.setupAddons(app, callback);
    }

   getRestoreUrl(app.lastBackupId, function (error, result) {
        if (error) return callback(error);

        debugApp(app, 'restoreApp: restoreUrl:%s', result.url);

        shell.sudo('restoreApp', [ RESTORE_APP_CMD,  app.id, result.url, result.backupKey ], function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'Error restoring: ' + error));

            addons.restoreAddons(app, callback);
        });
    });
}

function backupApp(app, callback) {
    if (!safe.fs.writeFileSync(path.join(paths.DATA_DIR, app.id + '/config.json'), JSON.stringify(app))) {
        return callback(safe.error);
    }

    getBackupUrl(app, null, function (error, result) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        debugApp(app, 'backupApp: backup url:%s backup id:%s', result.url, result.id);

        async.series([
            ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
                        addons.backupAddons.bind(null, app),
                        shell.sudo.bind(null, 'backupApp', [ BACKUP_APP_CMD,  app.id, result.url, result.backupKey ]),
            ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
        ], function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'Error backing up: ' + error));

            debugApp(app, 'backupApp: successful');

            apps.setRestorePoint(app.id, result.id, app.manifest, callback.bind(null, null, result.id));
        });
    });
}

function backupBoxWithAppBackupIds(appBackupIds, callback) {
    assert(util.isArray(appBackupIds));

    getBackupUrl(null /* app */, appBackupIds, function (error, result) {
        if (error) return callback(new CloudronError(CloudronError.APPSTORE_DOWN, error.message));

        debug('backup: url %s', result.url);

        async.series([
            ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
                        shell.sudo.bind(null, 'backupBox', [ BACKUP_BOX_CMD, result.url, result.backupKey ]),
            ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
        ], function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            debug('backup: successful');

            callback(null, result.id);
        });
    });
}

function backupBox(callback) {
    apps.getAll(function (error, allApps) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var appBackupIds = allApps.map(function (app) { return app.lastBackupId; });

        backupBoxWithAppBackupIds(appBackupIds, callback);
    });
}

function backup(callback) {
    callback = callback || function () { }; // callback can be empty for timer triggered backup

    apps.getAll(function (error, allApps) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var processed = 0;
        var step = 100/(allApps.length+1);

        progress.set(progress.BACKUP, processed, '');

        async.mapSeries(allApps, function iterator(app, iteratorCallback) {
            ++processed;

            // only backup apps that are installed or pending configure. Rest of them are in some
            // state not good for consistent backup
            if ((app.installationState === appdb.ISTATE_INSTALLED && app.health === appdb.HEALTH_HEALTHY) || app.installationState === appdb.ISTATE_PENDING_CONFIGURE) {
                return backupApp(app, function (error, backupId) {
                    progress.set(progress.BACKUP, step * processed, app.location);
                    iteratorCallback(error, backupId);
                });
            }

            debugApp(app, 'Skipping backup (istate:%s health%s). Reusing %s', app.installationState, app.health, app.lastBackupId);
            progress.set(progress.BACKUP, step * processed, app.location);

            return iteratorCallback(null, app.lastBackupId);
        }, function appsBackedUp(error, backupIds) {
            if (error) return callback(error);

            backupBoxWithAppBackupIds(backupIds, function (error, restoreKey) {
                progress.set(progress.BACKUP, 100, '');
                callback(error, restoreKey);
            });
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
    assert.strictEqual(typeof callback, 'function');

    userdb.count(function (error, count) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        callback(null, { activated: count !== 0, version: config.version() });
    });
}

function getCloudronDetails(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gCloudronDetails) return callback(null, gCloudronDetails);

    superagent
        .get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn())
        .query({ token: config.token() })
        .end(function (error, result) {
            if (error) return callback(error);
            if (result.status !== 200) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            gCloudronDetails = result.body.box;

            return callback(null, gCloudronDetails);
        });
}

function getConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    getCloudronDetails(function (error, result) {
        if (error) {
            console.error('Failed to fetch cloudron details.', error);

            // set fallback values to avoid dependency on appstore
            result = {
                region: result ? result.region : null,
                size: result ? result.size : null
            };
        }

        callback(null, {
            apiServerOrigin: config.apiServerOrigin(),
            webServerOrigin: config.webServerOrigin(),
            isDev: /dev/i.test(config.get('boxVersionsUrl')),
            fqdn: config.fqdn(),
            ip: getIp(),
            version: config.version(),
            update: updater.getUpdateInfo(),
            progress: progress.get(),
            isCustomDomain: config.isCustomDomain(),
            developerMode: config.developerMode(),
            region: result.region,
            size: result.size
        });
    });
}

function sendHeartbeat() {
    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    // TODO: this must be a POST
    superagent.get(url).query({ token: config.token(), version: config.version() }).timeout(10000).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successful');
    });
}

function sendMailDnsRecordsRequest(callback) {
    assert.strictEqual(typeof callback, 'function');

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
    assert.strictEqual(typeof certificate, 'string');
    assert.strictEqual(typeof key, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('Updating certificates');

    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), certificate)) {
        return callback(new CloudronError(CloudronError.INTERNAL_ERROR, safe.error.message));
    }

    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), key)) {
        return callback(new CloudronError(CloudronError.INTERNAL_ERROR, safe.error.message));
    }

    shell.sudo('setCertificate', [ RELOAD_NGINX_CMD ], function (error) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function reboot(callback) {
    shell.sudo('reboot', [ REBOOT_CMD ], callback);
}

function migrate(size, region, callback) {
    assert.strictEqual(typeof size, 'string');
    assert.strictEqual(typeof region, 'string');
    assert.strictEqual(typeof callback, 'function');

    backup(function (error, restoreKey) {
        if (error) return callback(error);

        debug('migrate: size %s region %s restoreKey %s', size, region, restoreKey);

        superagent
          .post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/migrate')
          .query({ token: config.token() })
          .send({ size: size, region: region, restoreKey: restoreKey })
          .end(function (error, result) {
            if (error) return callback(error);
            if (result.status === 409) return callback(new CloudronError(CloudronError.INVALID_STATE));
            if (result.status === 404) return callback(new CloudronError(CloudronError.NOT_FOUND));
            if (result.status !== 202) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            return callback(null);
        });
    });
}
