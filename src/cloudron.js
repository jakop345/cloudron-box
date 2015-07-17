/* jslint node: true */

'use strict';

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    activate: activate,
    getConfig: getConfig,
    getStatus: getStatus,

    setCertificate: setCertificate,

    sendHeartbeat: sendHeartbeat,

    update: update,
    reboot: reboot,
    migrate: migrate,
    backup: backup,
    ensureBackup: ensureBackup
};

var apps = require('./apps.js'),
    AppsError = require('./apps.js').AppsError,
    assert = require('assert'),
    async = require('async'),
    backups = require('./backups.js'),
    BackupsError = require('./backups.js').BackupsError,
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    debug = require('debug')('box:cloudron'),
    fs = require('fs'),
    locker = require('./locker.js'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    SettingsError = settings.SettingsError,
    shell = require('./shell.js'),
    superagent = require('superagent'),
    sysinfo = require('./sysinfo.js'),
    tokendb = require('./tokendb.js'),
    updateChecker = require('./updatechecker.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    userdb = require('./userdb.js'),
    util = require('util');

var RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    REBOOT_CMD = path.join(__dirname, 'scripts/reboot.sh'),
    BACKUP_BOX_CMD = path.join(__dirname, 'scripts/backupbox.sh'),
    BACKUP_SWAP_CMD = path.join(__dirname, 'scripts/backupswap.sh'),
    INSTALLER_UPDATE_URL = 'http://127.0.0.1:2020/api/v1/installer/update';

var gAddMailDnsRecordsTimerId = null,
    gCloudronDetails = null;            // cached cloudron details like region,size...

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
CloudronError.BAD_USERNAME = 'Bad username';
CloudronError.BAD_EMAIL = 'Bad email';
CloudronError.BAD_PASSWORD = 'Bad password';
CloudronError.BAD_NAME = 'Bad name';
CloudronError.BAD_STATE = 'Bad state';
CloudronError.NOT_FOUND = 'Not found';

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

function activate(username, password, email, name, ip, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('activating user:%s email:%s', username, email);

    setTimeZone(ip, function () { });

    settings.setCloudronName(name, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return callback(new CloudronError(CloudronError.BAD_NAME));
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

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
    });
}

function getStatus(callback) {
    assert.strictEqual(typeof callback, 'function');

    userdb.count(function (error, count) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        settings.getCloudronName(function (error, cloudronName) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            callback(null, {
                activated: count !== 0,
                version: config.version(),
                cloudronName: cloudronName
            });
        });
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

        settings.getCloudronName(function (error, cloudronName) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            callback(null, {
                apiServerOrigin: config.apiServerOrigin(),
                webServerOrigin: config.webServerOrigin(),
                isDev: config.isDev(),
                fqdn: config.fqdn(),
                ip: sysinfo.getIp(),
                version: config.version(),
                update: updateChecker.getUpdateInfo(),
                progress: progress.get(),
                isCustomDomain: config.isCustomDomain(),
                developerMode: config.developerMode(),
                region: result.region,
                size: result.size,
                cloudronName: cloudronName
            });
        });
    });
}

function sendHeartbeat() {
    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    // TODO: this must be a POST
    superagent.get(url).query({ token: config.token(), version: config.version() }).timeout(10000).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with %s %s', result.statusCode, result.text);
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
        { subdomain: '', type: 'TXT', value: '"v=spf1 ip4:' + sysinfo.getIp() + ' ~all"' },
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

    var error = locker.lock(locker.OP_MIGRATE);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    function unlock(error) {
        if (error) {
            debug('Failed to migrate', error);
            locker.unlock(locker.OP_MIGRATE);
        } else {
            debug('Migration initiated successfully');
            // do not unlock; cloudron is migrating
        }

        return;
    }

    // initiate the migration in the background
    backupBoxAndApps(function (error, restoreKey) {
        if (error) return unlock(error);

        debug('migrate: size %s region %s restoreKey %s', size, region, restoreKey);

        superagent
          .post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/migrate')
          .query({ token: config.token() })
          .send({ size: size, region: region, restoreKey: restoreKey })
          .end(function (error, result) {
            if (error) return unlock(error);
            if (result.status === 409) return unlock(new CloudronError(CloudronError.BAD_STATE));
            if (result.status === 404) return unlock(new CloudronError(CloudronError.NOT_FOUND));
            if (result.status !== 202) return unlock(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            return unlock(null);
        });
    });

    callback(null);
}

function update(boxUpdateInfo, callback) {
    assert.strictEqual(typeof boxUpdateInfo, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!boxUpdateInfo) return callback(null);

    var error = locker.lock(locker.OP_BOX_UPDATE);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    progress.set(progress.UPDATE, 0, 'Begin ' + (boxUpdateInfo.update ? 'upgrade': 'update'));

    // initiate the update/upgrade but do not wait for it
    if (boxUpdateInfo.upgrade) {
        doUpgrade(boxUpdateInfo, function (error) {
            locker.unlock(locker.OP_BOX_UPDATE);
        });
    } else {
        doUpdate(boxUpdateInfo, function (error) {
            locker.unlock(locker.OP_BOX_UPDATE);
        });
    }

    callback(null);
}

function doUpgrade(boxUpdateInfo, callback) {
    assert(boxUpdateInfo !== null && typeof boxUpdateInfo === 'object');

    progress.set(progress.UPDATE, 5, 'Create app and box backup');

    backupBoxAndApps(function (error) {
        if (error) return callback(error);

        superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/upgrade')
          .query({ token: config.token() })
          .send({ version: boxUpdateInfo.version })
          .end(function (error, result) {
            if (error) return callback(new Error('Error making upgrade request: ' + error));
            if (result.status !== 202) return callback(new Error('Server not ready to upgrade: ' + result.body));

            progress.set(progress.UPDATE, 10, 'Updating base system');

            // no need to unlock since this is the last thing we ever do on this box

            callback(null);
        });
    });
}

function doUpdate(boxUpdateInfo, callback) {
    assert(boxUpdateInfo && typeof boxUpdateInfo === 'object');

    progress.set(progress.UPDATE, 5, 'Create box backup');

    backupBox(function (error) {
        if (error) return callback(error);

        // fetch a signed sourceTarballUrl
        superagent.get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/sourcetarballurl')
          .query({ token: config.token(), boxVersion: boxUpdateInfo.version })
          .end(function (error, result) {
            if (error) return callback(new Error('Error fetching sourceTarballUrl: ' + error));
            if (result.status !== 200) return callback(new Error('Error fetching sourceTarballUrl status: ' + result.status));
            if (!safe.query(result, 'body.url')) return callback(new Error('Error fetching sourceTarballUrl response: ' + result.body));

            // NOTE: the args here are tied to the installer revision, box code and appstore provisioning logic
            var args = {
                sourceTarballUrl: result.body.url,

                // this data is opaque to the installer
                data: {
                    boxVersionsUrl: config.get('boxVersionsUrl'),
                    version: boxUpdateInfo.version,
                    apiServerOrigin: config.apiServerOrigin(),
                    webServerOrigin: config.webServerOrigin(),
                    fqdn: config.fqdn(),
                    token: config.token(),
                    tlsCert: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), 'utf8'),
                    tlsKey: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), 'utf8'),
                    isCustomDomain: config.isCustomDomain(),
                    restoreUrl: null,
                    restoreKey: null,
                    developerMode: config.developerMode() // this survives updates but not upgrades
                }
            };

            debug('updating box %j', args);

            superagent.post(INSTALLER_UPDATE_URL).send(args).end(function (error, result) {
                if (error) return callback(error);
                if (result.status !== 202) return callback(new Error('Error initiating update: ' + result.body));

                progress.set(progress.UPDATE, 10, 'Updating cloudron software');

                callback(null);
            });
        });

        // Do not add any code here. The installer script will stop the box code any instant
    });
}

function backup(callback) {
    assert.strictEqual(typeof callback, 'function');

    var error = locker.lock(locker.OP_FULL_BACKUP);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    // start the backup operation in the background
    backupBoxAndApps(function (error) {
        if (error) console.error('backup failed.', error);

        locker.unlock(locker.OP_FULL_BACKUP);
    });

    callback(null);
}

function ensureBackup(callback) {
    callback = callback || function () { };

    backups.getAllPaged(1, 1, function (error, backups) {
        if (error) {
            debug('Unable to list backups', error);
            return callback(error); // no point trying to backup if appstore is down
        }

        if (backups.length !== 0 && (new Date() - new Date(backups[0].creationTime) < 23 * 60 * 60 * 1000)) { // ~1 day ago
            debug('Previous backup was %j, no need to backup now', backups[0]);
            return callback(null);
        }

        backup(callback);
    });
}

function backupBoxWithAppBackupIds(appBackupIds, callback) {
    assert(util.isArray(appBackupIds));

    backups.getBackupUrl(null /* app */, appBackupIds, function (error, result) {
        if (error && error.reason === BackupsError.EXTERNAL_ERROR) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, error.message));
        if (error) return callback(new CloudronError.INTERNAL_ERROR, error);

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

// this function expects you to have a lock
function backupBox(callback) {
    apps.getAll(function (error, allApps) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var appBackupIds = allApps.map(function (app) { return app.lastBackupId; });
        appBackupIds = appBackupIds.filter(function (id) { return id !== null }); // remove apps that were never backed up

        backupBoxWithAppBackupIds(appBackupIds, callback);
    });
}

// this function expects you to have a lock
function backupBoxAndApps(callback) {
    callback = callback || function () { }; // callback can be empty for timer triggered backup

    apps.getAll(function (error, allApps) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var processed = 0;
        var step = 100/(allApps.length+1);

        progress.set(progress.BACKUP, processed, '');

        async.mapSeries(allApps, function iterator(app, iteratorCallback) {
            ++processed;

            apps.backupApp(app, function (error, backupId) {
                progress.set(progress.BACKUP, step * processed, app.location);

                if (error && error.reason === AppsError.BAD_STATE) {
                    debugApp(app, 'Skipping backup (istate:%s health%s). Reusing %s', app.installationState, app.health, app.lastBackupId);
                    backupId = app.lastBackupId;
                }

                return iteratorCallback(null, backupId);
            });
        }, function appsBackedUp(error, backupIds) {
            if (error) return callback(error);

            backupIds = backupIds.filter(function (id) { return id !== null; }); // remove apps that were never backed up

            backupBoxWithAppBackupIds(backupIds, function (error, restoreKey) {
                progress.set(progress.BACKUP, 100, '');
                callback(error, restoreKey);
            });
        });
    });
}

