'use strict';

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    activate: activate,
    getConfig: getConfig,
    getStatus: getStatus,

    sendHeartbeat: sendHeartbeat,

    updateToLatest: updateToLatest,
    update: update,
    reboot: reboot,
    backup: backup,
    retire: retire,
    ensureBackup: ensureBackup,

    isConfiguredSync: isConfiguredSync,

    checkDiskSpace: checkDiskSpace,

    events: new (require('events').EventEmitter)(),

    EVENT_ACTIVATED: 'activated',
    EVENT_CONFIGURED: 'configured',
    EVENT_FIRST_RUN: 'firstrun'
};

var apps = require('./apps.js'),
    AppsError = require('./apps.js').AppsError,
    assert = require('assert'),
    async = require('async'),
    backups = require('./backups.js'),
    BackupsError = require('./backups.js').BackupsError,
    clientdb = require('./clientdb.js'),
    config = require('./config.js'),
    debug = require('debug')('box:cloudron'),
    df = require('node-df'),
    fs = require('fs'),
    locker = require('./locker.js'),
    mailer = require('./mailer.js'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    shell = require('./shell.js'),
    subdomains = require('./subdomains.js'),
    superagent = require('superagent'),
    sysinfo = require('./sysinfo.js'),
    tokendb = require('./tokendb.js'),
    updateChecker = require('./updatechecker.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    userdb = require('./userdb.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    webhooks = require('./webhooks.js');

var REBOOT_CMD = path.join(__dirname, 'scripts/reboot.sh'),
    BACKUP_BOX_CMD = path.join(__dirname, 'scripts/backupbox.sh'),
    BACKUP_SWAP_CMD = path.join(__dirname, 'scripts/backupswap.sh'),
    INSTALLER_UPDATE_URL = 'http://127.0.0.1:2020/api/v1/installer/update',
    RETIRE_CMD = path.join(__dirname, 'scripts/retire.sh');

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

var gUpdatingDns = false,                // flag for dns update reentrancy
    gCloudronDetails = null,             // cached cloudron details like region,size...
    gIsConfigured = null;                // cached configured state so that return value is synchronous. null means we are not initialized yet

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
CloudronError.ALREADY_UPTODATE = 'No Update Available';
CloudronError.NOT_FOUND = 'Not found';

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    exports.events.on(exports.EVENT_CONFIGURED, addDnsRecords);
    exports.events.on(exports.EVENT_FIRST_RUN, installAppBundle);

    if (!fs.existsSync(paths.FIRST_RUN_FILE)) {
        // EE API is sync. do not keep the server waiting
        process.nextTick(function () { exports.events.emit(exports.EVENT_FIRST_RUN); });
        fs.writeFileSync(paths.FIRST_RUN_FILE, 'been there, done that', 'utf8');
    }

    syncConfigState(callback);
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    exports.events.removeListener(exports.EVENT_CONFIGURED, addDnsRecords);
    exports.events.removeListener(exports.EVENT_FIRST_RUN, installAppBundle);

    callback(null);
}

function isConfiguredSync() {
    return gIsConfigured === true;
}

function isConfigured(callback) {
    // set of rules to see if we have the configs required for cloudron to function
    // note this checks for missing configs and not invalid configs

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(error);

        if (!dnsConfig) return callback(null, false);

        var isConfigured = (config.isCustomDomain() && dnsConfig.provider === 'route53') ||
                        (!config.isCustomDomain() && dnsConfig.provider === 'caas');

        callback(null, isConfigured);
    });
}

function syncConfigState(callback) {
    assert(!gIsConfigured);

    callback = callback || NOOP_CALLBACK;

    isConfigured(function (error, configured) {
        if (error) return callback(error);

        debug('syncConfigState: configured = %s', configured);

        if (configured) {
            exports.events.emit(exports.EVENT_CONFIGURED);
        } else {
            settings.events.once(settings.DNS_CONFIG_KEY, function () { syncConfigState(); }); // check again later
        }

        gIsConfigured = configured;

        callback();
    });
}

function setTimeZone(ip, callback) {
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('setTimeZone ip:%s', ip);

    superagent.get('http://www.telize.com/geoip/' + ip).end(function (error, result) {
        if ((error && !error.response) || result.statusCode !== 200) {
            debug('Failed to get geo location: %s', error.message);
            return callback(null);
        }

        if (!result.body.timezone) {
            debug('No timezone in geoip response : %j', result.body);
            return callback(null);
        }

        debug('Setting timezone to ', result.body.timezone);

        settings.setTimeZone(result.body.timezone, callback);
    });
}

function activate(username, password, email, displayName, ip, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof displayName, 'string');
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('activating user:%s email:%s', username, email);

    setTimeZone(ip, function () { }); // TODO: get this from user. note that timezone is detected based on the browser location and not the cloudron region

    user.createOwner(username, password, email, displayName, function (error, userObject) {
        if (error && error.reason === UserError.ALREADY_EXISTS) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));
        if (error && error.reason === UserError.BAD_USERNAME) return callback(new CloudronError(CloudronError.BAD_USERNAME));
        if (error && error.reason === UserError.BAD_PASSWORD) return callback(new CloudronError(CloudronError.BAD_PASSWORD));
        if (error && error.reason === UserError.BAD_EMAIL) return callback(new CloudronError(CloudronError.BAD_EMAIL));
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        clientdb.getByAppIdAndType('webadmin', clientdb.TYPE_ADMIN, function (error, result) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            // Also generate a token so the admin creation can also act as a login
            var token = tokendb.generateToken();
            var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

            tokendb.add(token, tokendb.PREFIX_USER + userObject.id, result.id, expires, '*', function (error) {
                if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                // EE API is sync. do not keep the REST API reponse waiting
                process.nextTick(function () { exports.events.emit(exports.EVENT_ACTIVATED); });

                callback(null, { token: token, expires: expires });
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
                boxVersionsUrl: config.get('boxVersionsUrl'),
                apiServerOrigin: config.apiServerOrigin(), // used by CaaS tool
                provider: config.provider(),
                cloudronName: cloudronName
            });
        });
    });
}

function getCloudronDetails(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gCloudronDetails) return callback(null, gCloudronDetails);

    if (!config.token()) {
        gCloudronDetails = {
            region: null,
            size: null
        };

        return callback(null, gCloudronDetails);
    }

    superagent
        .get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn())
        .query({ token: config.token() })
        .end(function (error, result) {
            if (error && !error.response) return callback(error);
            if (result.statusCode !== 200) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            gCloudronDetails = result.body.box;

            return callback(null, gCloudronDetails);
        });
}

function getConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    getCloudronDetails(function (error, result) {
        if (error) {
            debug('Failed to fetch cloudron details.', error);

            // set fallback values to avoid dependency on appstore
            result = {
                region: result ? result.region : null,
                size: result ? result.size : null
            };
        }

        settings.getCloudronName(function (error, cloudronName) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            settings.getDeveloperMode(function (error, developerMode) {
                if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                sysinfo.getIp(function (error, ip) {
                    if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                    callback(null, {
                        apiServerOrigin: config.apiServerOrigin(),
                        webServerOrigin: config.webServerOrigin(),
                        isDev: config.isDev(),
                        fqdn: config.fqdn(),
                        ip: ip,
                        version: config.version(),
                        update: updateChecker.getUpdateInfo(),
                        progress: progress.get(),
                        isCustomDomain: config.isCustomDomain(),
                        developerMode: developerMode,
                        region: result.region,
                        size: result.size,
                        memory: os.totalmem(),
                        provider: config.provider(),
                        cloudronName: cloudronName
                    });
                });
            });
        });
    });
}

function sendHeartbeat() {
    if (!config.token()) return;

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/heartbeat';
    superagent.post(url).query({ token: config.token(), version: config.version() }).timeout(10000).end(function (error, result) {
        if (error && !error.response) debug('Network error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with %s %s', result.statusCode, result.text);
        else debug('Heartbeat sent to %s', url);
    });
}

function readDkimPublicKeySync() {
    var dkimPublicKeyFile = path.join(paths.MAIL_DATA_DIR, 'dkim/' + config.fqdn() + '/public');
    var publicKey = safe.fs.readFileSync(dkimPublicKeyFile, 'utf8');

    if (publicKey === null) {
        debug('Error reading dkim public key.', safe.error);
        return null;
    }

    // remove header, footer and new lines
    publicKey = publicKey.split('\n').slice(1, -2).join('');

    return publicKey;
}

// NOTE: if you change the SPF record here, be sure the wait check in mailer.js
function txtRecordsWithSpf(callback) {
    assert.strictEqual(typeof callback, 'function');

    subdomains.get('', 'TXT', function (error, txtRecords) {
        if (error) return callback(error);

        debug('txtRecordsWithSpf: current txt records - %j', txtRecords);

        var i, validSpf;

        for (i = 0; i < txtRecords.length; i++) {
            if (txtRecords[i].indexOf('"v=spf1 ') !== 0) continue; // not SPF

            validSpf = txtRecords[i].indexOf(' a:' + config.adminFqdn() + ' ') !== -1;
            break;
        }

        if (validSpf) return callback(null, null);

        if (i == txtRecords.length) {
            txtRecords[i] = '"v=spf1 a:' + config.adminFqdn() + ' ~all"';
        } else {
            txtRecords[i] = '"v=spf1 a:' + config.adminFqdn() + ' ' + txtRecords[i].slice('"v=spf1 '.length);
        }

        return callback(null, txtRecords);
    });
}

function addDnsRecords() {
    var callback = NOOP_CALLBACK;

    if (process.env.BOX_ENV === 'test') return callback();

    if (gUpdatingDns) {
        debug('addDnsRecords: dns update already in progress');
        return callback();
    }
    gUpdatingDns = true;

    var DKIM_SELECTOR = 'cloudron';
    var DMARC_REPORT_EMAIL = 'dmarc-report@cloudron.io';

    var dkimKey = readDkimPublicKeySync();
    if (!dkimKey) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, new Error('internal error failed to read dkim public key')));

    sysinfo.getIp(function (error, ip) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var webadminRecord = { subdomain: 'my', type: 'A', values: [ ip ] };
        // t=s limits the domainkey to this domain and not it's subdomains
        var dkimRecord = { subdomain: DKIM_SELECTOR + '._domainkey', type: 'TXT', values: [ '"v=DKIM1; t=s; p=' + dkimKey + '"' ] };
        // DMARC requires special setup if report email id is in different domain
        var dmarcRecord = { subdomain: '_dmarc', type: 'TXT', values: [ '"v=DMARC1; p=none; pct=100; rua=mailto:' + DMARC_REPORT_EMAIL + '; ruf=' + DMARC_REPORT_EMAIL + '"' ] };

        var records = [ ];
        if (config.isCustomDomain()) {
            records.push(webadminRecord);
            records.push(dkimRecord);
        } else {
            // for custom domains, we show a nakeddomain.html page
            var nakedDomainRecord = { subdomain: '', type: 'A', values: [ ip ] };

            records.push(nakedDomainRecord);
            records.push(webadminRecord);
            records.push(dkimRecord);
            records.push(dmarcRecord);
        }

        debug('addDnsRecords: %j', records);

        async.retry({ times: 10, interval: 20000 }, function (retryCallback) {
            txtRecordsWithSpf(function (error, txtRecords) {
                if (error) return retryCallback(error);

                if (txtRecords) records.push({ subdomain: '', type: 'TXT', values: txtRecords });

                debug('addDnsRecords: will update %j', records);

                async.mapSeries(records, function (record, iteratorCallback) {
                    subdomains.update(record.subdomain, record.type, record.values, iteratorCallback);
                }, function (error, changeIds) {
                    if (error) debug('addDnsRecords: failed to update : %s. will retry', error);
                    else debug('addDnsRecords: records %j added with changeIds %j', records, changeIds);

                    retryCallback(error);
                });
            });
        }, function (error) {
            gUpdatingDns = false;

            debug('addDnsRecords: done updating records with error:', error);

            callback(error);
        });
    });
}

function reboot(callback) {
    shell.sudo('reboot', [ REBOOT_CMD ], callback);
}

function update(boxUpdateInfo, callback) {
    assert.strictEqual(typeof boxUpdateInfo, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!boxUpdateInfo) return callback(null);

    var error = locker.lock(locker.OP_BOX_UPDATE);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    // ensure tools can 'wait' on progress
    progress.set(progress.UPDATE, 0, 'Starting');

    // initiate the update/upgrade but do not wait for it
    if (config.version().match(/[-+]/) !== null && config.version().replace(/[-+].*/, '') === boxUpdateInfo.version) {
        doShortCircuitUpdate(boxUpdateInfo, function (error) {
            if (error) debug('Short-circuit update failed', error);
            locker.unlock(locker.OP_BOX_UPDATE);
        });
    } else if (boxUpdateInfo.upgrade) {
        debug('Starting upgrade');
        doUpgrade(boxUpdateInfo, function (error) {
            if (error) {
                console.error('Upgrade failed with error:', error);
                locker.unlock(locker.OP_BOX_UPDATE);
            }
        });
    } else {
        debug('Starting update');
        doUpdate(boxUpdateInfo, function (error) {
            if (error) {
                console.error('Update failed with error:', error);
                locker.unlock(locker.OP_BOX_UPDATE);
            }
        });
    }

    callback(null);
}


function updateToLatest(callback) {
    assert.strictEqual(typeof callback, 'function');

    var boxUpdateInfo = updateChecker.getUpdateInfo().box;
    if (!boxUpdateInfo) return callback(new CloudronError(CloudronError.ALREADY_UPTODATE, 'No update available'));

    update(boxUpdateInfo, callback);
}

function doShortCircuitUpdate(boxUpdateInfo, callback) {
    assert(boxUpdateInfo !== null && typeof boxUpdateInfo === 'object');

    debug('Starting short-circuit from prerelease version %s to release version %s', config.version(), boxUpdateInfo.version);
    config.setVersion(boxUpdateInfo.version);
    progress.clear(progress.UPDATE);
    updateChecker.resetUpdateInfo();
    callback();
}

function doUpgrade(boxUpdateInfo, callback) {
    assert(boxUpdateInfo !== null && typeof boxUpdateInfo === 'object');

    function upgradeError(e) {
        progress.set(progress.UPDATE, -1, e.message);
        callback(e);
    }

    progress.set(progress.UPDATE, 5, 'Backing up for upgrade');

    backupBoxAndApps(function (error) {
        if (error) return upgradeError(error);

        superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/upgrade')
          .query({ token: config.token() })
          .send({ version: boxUpdateInfo.version })
          .end(function (error, result) {
            if (error && !error.response) return upgradeError(new Error('Network error making upgrade request: ' + error));
            if (result.statusCode !== 202) return upgradeError(new Error(util.format('Server not ready to upgrade. statusCode: %s body: %j', result.status, result.body)));

            progress.set(progress.UPDATE, 10, 'Updating base system');

            // no need to unlock since this is the last thing we ever do on this box
            callback();
            retire();
        });
    });
}

function doUpdate(boxUpdateInfo, callback) {
    assert(boxUpdateInfo && typeof boxUpdateInfo === 'object');

    function updateError(e) {
        progress.set(progress.UPDATE, -1, e.message);
        callback(e);
    }

    progress.set(progress.UPDATE, 5, 'Backing up for update');

    backupBoxAndApps(function (error) {
        if (error) return updateError(error);

        // NOTE: the args here are tied to the installer revision, box code and appstore provisioning logic
        var args = {
            sourceTarballUrl: boxUpdateInfo.sourceTarballUrl,

            // this data is opaque to the installer
            data: {
                token: config.token(),
                apiServerOrigin: config.apiServerOrigin(),
                webServerOrigin: config.webServerOrigin(),
                fqdn: config.fqdn(),
                tlsCert: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), 'utf8'),
                tlsKey: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), 'utf8'),
                isCustomDomain: config.isCustomDomain(),

                appstore: {
                    token: config.token(),
                    apiServerOrigin: config.apiServerOrigin()
                },
                caas: {
                    token: config.token(),
                    apiServerOrigin: config.apiServerOrigin(),
                    webServerOrigin: config.webServerOrigin()
                },

                version: boxUpdateInfo.version,
                boxVersionsUrl: config.get('boxVersionsUrl')
            }
        };

        debug('updating box %j', args);

        superagent.post(INSTALLER_UPDATE_URL).send(args).end(function (error, result) {
            if (error && !error.response) return updateError(error);
            if (result.statusCode !== 202) return updateError(new Error('Error initiating update: ' + JSON.stringify(result.body)));

            progress.set(progress.UPDATE, 10, 'Updating cloudron software');

            callback(null);
        });

        // Do not add any code here. The installer script will stop the box code any instant
    });
}

function backup(callback) {
    assert.strictEqual(typeof callback, 'function');

    var error = locker.lock(locker.OP_FULL_BACKUP);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    // ensure tools can 'wait' on progress
    progress.set(progress.BACKUP, 0, 'Starting');

    // start the backup operation in the background
    backupBoxAndApps(function (error) {
        if (error) console.error('backup failed.', error);

        locker.unlock(locker.OP_FULL_BACKUP);
    });

    callback(null);
}

function ensureBackup(callback) {
    callback = callback || NOOP_CALLBACK;

    backups.getPaged(1, 1, function (error, backups) {
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

    backups.getBackupUrl(appBackupIds, function (error, result) {
        if (error && error.reason === BackupsError.EXTERNAL_ERROR) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, error.message));
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        debug('backup: url %s', result.url);

        async.series([
            ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
            shell.sudo.bind(null, 'backupBox', [ BACKUP_BOX_CMD, result.url, result.backupKey ]),
            ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
        ], function (error) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            debug('backup: successful');

            webhooks.backupDone(result.id, null /* app */, appBackupIds, function (error) {
                if (error) return callback(error);
                callback(null, result.id);
            });
        });
    });
}

// this function expects you to have a lock
function backupBox(callback) {
    apps.getAll(function (error, allApps) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var appBackupIds = allApps.map(function (app) { return app.lastBackupId; });
        appBackupIds = appBackupIds.filter(function (id) { return id !== null; }); // remove apps that were never backed up

        backupBoxWithAppBackupIds(appBackupIds, callback);
    });
}

// this function expects you to have a lock
function backupBoxAndApps(callback) {
    callback = callback || NOOP_CALLBACK;

    apps.getAll(function (error, allApps) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var processed = 0;
        var step = 100/(allApps.length+1);

        progress.set(progress.BACKUP, processed, '');

        async.mapSeries(allApps, function iterator(app, iteratorCallback) {
            ++processed;

            apps.backupApp(app, app.manifest.addons, function (error, backupId) {
                if (error && error.reason !== AppsError.BAD_STATE) {
                    debugApp(app, 'Unable to backup', error);
                    return iteratorCallback(error);
                }

                progress.set(progress.BACKUP, step * processed, 'Backed up app at ' + app.location);

                iteratorCallback(null, backupId || null); // clear backupId if is in BAD_STATE and never backed up
            });
        }, function appsBackedUp(error, backupIds) {
            if (error) {
                progress.set(progress.BACKUP, 100, error.message);
                return callback(error);
            }

            backupIds = backupIds.filter(function (id) { return id !== null; }); // remove apps in bad state that were never backed up

            backupBoxWithAppBackupIds(backupIds, function (error, filename) {
                progress.set(progress.BACKUP, 100, error ? error.message : '');

                callback(error, filename);
            });
        });
    });
}

function installAppBundle(callback) {
    callback = callback || NOOP_CALLBACK;

    var bundle = config.get('appBundle');

    if (!bundle || bundle.length === 0) {
        debug('installAppBundle: no bundle set');
        return callback();
    }

    async.eachSeries(bundle, function (appInfo, iteratorCallback) {
        var appstoreId = appInfo.appstoreId;
        var parts = appstoreId.split('@');

        var url = config.apiServerOrigin() + '/api/v1/apps/' + parts[0] + (parts[1] ? '/versions/' + parts[1] : '');

        superagent.get(url).end(function (error, result) {
            if (error && !error.response) return iteratorCallback(new Error('Network error: ' + error.message));

            if (result.statusCode !== 200) return iteratorCallback(util.format('Failed to get app info from store.', result.statusCode, result.text));

            debug('autoInstall: installing %s at %s', appstoreId, appInfo.location);

            apps.install(uuid.v4(), appstoreId, result.body.manifest, appInfo.location,
                appInfo.portBindings || null, appInfo.accessRestriction || null,
                null /* icon */, null /* cert */, null /* key */, 0 /* default mem limit */,
                iteratorCallback);
        });
    }, function (error) {
        if (error) debug('autoInstallApps: ', error);

        callback();
    });
}

function checkDiskSpace(callback) {
    callback = callback || NOOP_CALLBACK;

    debug('Checking disk space');

    df(function (error, entries) {
        if (error) {
            debug('df error %s', error.message);
            mailer.outOfDiskSpace(error.message);
            return callback();
        }

        var oos = entries.some(function (entry) {
            return (entry.mount === paths.DATA_DIR && entry.capacity >= 0.90) ||
                   (entry.mount === '/' && entry.used <= (1.25 * 1024 * 1024)); // 1.5G
        });

        debug('Disk space checked. ok: %s', !oos);

        if (oos) mailer.outOfDiskSpace(JSON.stringify(entries, null, 4));

        callback();
    });
}

function retire(callback) {
    callback = callback || NOOP_CALLBACK;

    var data = {
        isCustomDomain: config.isCustomDomain(),
        fqdn: config.fqdn()
    };
    shell.sudo('retire', [ RETIRE_CMD, JSON.stringify(data) ], callback);
}

