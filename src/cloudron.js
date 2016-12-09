'use strict';

exports = module.exports = {
    CloudronError: CloudronError,

    initialize: initialize,
    uninitialize: uninitialize,
    activate: activate,
    getConfig: getConfig,
    getStatus: getStatus,

    sendHeartbeat: sendHeartbeat,
    sendAliveStatus: sendAliveStatus,

    updateToLatest: updateToLatest,
    reboot: reboot,
    retire: retire,
    migrate: migrate,

    isConfiguredSync: isConfiguredSync,

    checkDiskSpace: checkDiskSpace,

    readDkimPublicKeySync: readDkimPublicKeySync,

    events: new (require('events').EventEmitter)(),

    EVENT_ACTIVATED: 'activated',
    EVENT_CONFIGURED: 'configured'
};

var apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    backups = require('./backups.js'),
    child_process = require('child_process'),
    clients = require('./clients.js'),
    config = require('./config.js'),
    constants = require('./constants.js'),
    debug = require('debug')('box:cloudron'),
    df = require('node-df'),
    eventlog = require('./eventlog.js'),
    fs = require('fs'),
    locker = require('./locker.js'),
    mailer = require('./mailer.js'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    SettingsError = settings.SettingsError,
    shell = require('./shell.js'),
    subdomains = require('./subdomains.js'),
    superagent = require('superagent'),
    sysinfo = require('./sysinfo.js'),
    tokendb = require('./tokendb.js'),
    updateChecker = require('./updatechecker.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    user = require('./user.js'),
    util = require('util'),
    _ = require('underscore');

var REBOOT_CMD = path.join(__dirname, 'scripts/reboot.sh'),
    UPDATE_CMD = path.join(__dirname, 'scripts/update.sh'),
    RETIRE_CMD = path.join(__dirname, 'scripts/retire.sh');

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

// result to not depend on the appstore
const BOX_AND_USER_TEMPLATE = {
    box: {
        region: null,
        size: null,
        plan: 'Custom Plan'
    },
    user: {
        billing: false,
        currency: ''
    }
};

var gUpdatingDns = false,                // flag for dns update reentrancy
    gBoxAndUserDetails = null,         // cached cloudron details like region,size...
    gIsConfigured = null;                // cached configured state so that return value is synchronous. null means we are not initialized yet

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
CloudronError.BAD_STATE = 'Bad state';
CloudronError.ALREADY_UPTODATE = 'No Update Available';
CloudronError.NOT_FOUND = 'Not found';
CloudronError.SELF_UPGRADE_NOT_SUPPORTED = 'Self upgrade not supported';

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    ensureDkimKeySync();

    exports.events.on(exports.EVENT_CONFIGURED, addDnsRecords);

    if (!fs.existsSync(paths.FIRST_RUN_FILE)) {
        debug('initialize: installing app bundle on first run');
        process.nextTick(installAppBundle);
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

        var isConfigured = (config.isCustomDomain() && (dnsConfig.provider === 'route53' || dnsConfig.provider === 'digitalocean' || dnsConfig.provider === 'noop')) ||
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

    // https://github.com/bluesmoon/node-geoip
    // https://github.com/runk/node-maxmind
    // { url: 'http://freegeoip.net/json/%s', jpath: 'time_zone' },
    // { url: 'http://ip-api.com/json/%s', jpath: 'timezone' },
    // { url: 'http://geoip.nekudo.com/api/%s', jpath: 'time_zone }

    superagent.get('http://ip-api.com/json/' + ip).timeout(10 * 1000).end(function (error, result) {
        if ((error && !error.response) || result.statusCode !== 200) {
            debug('Failed to get geo location: %s', error.message);
            return callback(null);
        }

        if (!result.body.timezone || typeof result.body.timezone !== 'string') {
            debug('No timezone in geoip response : %j', result.body);
            return callback(null);
        }

        debug('Setting timezone to ', result.body.timezone);

        settings.setTimeZone(result.body.timezone, callback);
    });
}

function activate(username, password, email, displayName, ip, auditSource, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof displayName, 'string');
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('activating user:%s email:%s', username, email);

    setTimeZone(ip, function () { }); // TODO: get this from user. note that timezone is detected based on the browser location and not the cloudron region

    user.createOwner(username, password, email, displayName, auditSource, function (error, userObject) {
        if (error && error.reason === UserError.ALREADY_EXISTS) return callback(new CloudronError(CloudronError.ALREADY_PROVISIONED));
        if (error && error.reason === UserError.BAD_FIELD) return callback(new CloudronError(CloudronError.BAD_FIELD, error.message));
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        clients.get('cid-webadmin', function (error, result) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

            // Also generate a token so the admin creation can also act as a login
            var token = tokendb.generateToken();
            var expires = Date.now() + constants.DEFAULT_TOKEN_EXPIRATION;

            tokendb.add(token, userObject.id, result.id, expires, '*', function (error) {
                if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

                // EE API is sync. do not keep the REST API reponse waiting
                process.nextTick(function () { exports.events.emit(exports.EVENT_ACTIVATED); });

                eventlog.add(eventlog.ACTION_ACTIVATE, auditSource, { });

                callback(null, { token: token, expires: expires });
            });
        });
    });
}

function getStatus(callback) {
    assert.strictEqual(typeof callback, 'function');

    user.count(function (error, count) {
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

function getBoxAndUserDetails(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gBoxAndUserDetails) return callback(null, gBoxAndUserDetails);

    // only supported for caas
    if (config.provider() !== 'caas') return callback(null, {});

    superagent
        .get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn())
        .query({ token: config.token() })
        .timeout(30 * 1000)
        .end(function (error, result) {
            if (error && !error.response) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, 'Cannot reach appstore'));
            if (result.statusCode !== 200) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('%s %j', result.statusCode, result.body)));

            gBoxAndUserDetails = result.body;

            return callback(null, gBoxAndUserDetails);
        });
}

function getConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    getBoxAndUserDetails(function (error, result) {
        if (error) debug('Failed to fetch cloudron details.', error.reason, error.message);

        result = _.extend(BOX_AND_USER_TEMPLATE, result || {});

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
                        isDemo: config.isDemo(),
                        developerMode: developerMode,
                        region: result.box.region,
                        size: result.box.size,
                        billing: !!result.user.billing,
                        plan: result.box.plan,
                        currency: result.user.currency,
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
    superagent.post(url).query({ token: config.token(), version: config.version() }).timeout(30 * 1000).end(function (error, result) {
        if (error && !error.response) debug('Network error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with %s %s', result.statusCode, result.text);
        else debug('Heartbeat sent to %s', url);
    });
}

function sendAliveStatus(callback) {
    if (typeof callback !== 'function') {
        callback = function (error) {
            if (error && error.reason !== CloudronError.INTERNAL_ERROR) console.error(error);
            else if (error) debug(error);
        };
    }

    function sendAliveStatusWithAppstoreConfig(appstoreConfig) {
        assert.strictEqual(typeof appstoreConfig.userId, 'string');
        assert.strictEqual(typeof appstoreConfig.cloudronId, 'string');
        assert.strictEqual(typeof appstoreConfig.token, 'string');

        var url = config.apiServerOrigin() + '/api/v1/users/' + appstoreConfig.userId + '/cloudrons/' + appstoreConfig.cloudronId;
        var data = {
            domain: config.fqdn(),
            version: config.version(),
            provider: config.provider()
        };

        superagent.post(url).send(data).query({ accessToken: appstoreConfig.token }).timeout(30 * 1000).end(function (error, result) {
            if (error && !error.response) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, error));
            if (result.statusCode === 404) return callback(new CloudronError(CloudronError.NOT_FOUND));
            if (result.statusCode !== 201) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('Sending alive status failed. %s %j', result.status, result.body)));

            callback(null);
        });
    }

    // Caas Cloudrons do not store appstore credentials in their local database
    if (config.provider() === 'caas') {
        if (!config.token()) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'no token set'));

        var url = config.apiServerOrigin() + '/api/v1/exchangeBoxTokenWithUserToken';
        superagent.post(url).query({ token: config.token() }).timeout(30 * 1000).end(function (error, result) {
            if (error && !error.response) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, error));
            if (result.statusCode !== 201) return callback(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('App purchase failed. %s %j', result.status, result.body)));

            sendAliveStatusWithAppstoreConfig(result.body);
        });
    } else {
        settings.getAppstoreConfig(function (error, result) {
            if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));
            if (!result.token) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, 'not registered yet'));

            sendAliveStatusWithAppstoreConfig(result);
        });
    }
}

function ensureDkimKeySync() {
    var dkimPrivateKeyFile = path.join(paths.MAIL_DATA_DIR, 'dkim/' + config.fqdn() + '/private');
    var dkimPublicKeyFile = path.join(paths.MAIL_DATA_DIR, 'dkim/' + config.fqdn() + '/public');

    if (fs.existsSync(dkimPrivateKeyFile) && fs.existsSync(dkimPublicKeyFile)) {
        debug('DKIM keys already present');
        return;
    }

    debug('Generating new DKIM keys');

    child_process.execSync('openssl genrsa -out ' + dkimPrivateKeyFile + ' 1024');
    child_process.execSync('openssl rsa -in ' + dkimPrivateKeyFile + ' -out ' + dkimPublicKeyFile + ' -pubout -outform PEM');
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

    var dkimKey = readDkimPublicKeySync();
    if (!dkimKey) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, new Error('Failed to read dkim public key')));

    sysinfo.getIp(function (error, ip) {
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        var webadminRecord = { subdomain: constants.ADMIN_LOCATION, type: 'A', values: [ ip ] };
        // t=s limits the domainkey to this domain and not it's subdomains
        var dkimRecord = { subdomain: DKIM_SELECTOR + '._domainkey', type: 'TXT', values: [ '"v=DKIM1; t=s; p=' + dkimKey + '"' ] };

        var records = [ ];
        if (config.isCustomDomain()) {
            records.push(webadminRecord);
            records.push(dkimRecord);
        } else {
            // for non-custom domains, we show a nakeddomain.html page
            var nakedDomainRecord = { subdomain: '', type: 'A', values: [ ip ] };

            records.push(nakedDomainRecord);
            records.push(webadminRecord);
            records.push(dkimRecord);
        }

        debug('addDnsRecords: %j', records);

        async.retry({ times: 10, interval: 20000 }, function (retryCallback) {
            txtRecordsWithSpf(function (error, txtRecords) {
                if (error) return retryCallback(error);

                if (txtRecords) records.push({ subdomain: '', type: 'TXT', values: txtRecords });

                debug('addDnsRecords: will update %j', records);

                async.mapSeries(records, function (record, iteratorCallback) {
                    subdomains.upsert(record.subdomain, record.type, record.values, iteratorCallback);
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

function update(boxUpdateInfo, auditSource, callback) {
    assert.strictEqual(typeof boxUpdateInfo, 'object');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!boxUpdateInfo) return callback(null);

    var error = locker.lock(locker.OP_BOX_UPDATE);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    eventlog.add(eventlog.ACTION_UPDATE, auditSource, { boxUpdateInfo: boxUpdateInfo });

    // ensure tools can 'wait' on progress
    progress.set(progress.UPDATE, 0, 'Starting');

    // initiate the update/upgrade but do not wait for it
    if (boxUpdateInfo.upgrade) {
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


function updateToLatest(auditSource, callback) {
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    var boxUpdateInfo = updateChecker.getUpdateInfo().box;
    if (!boxUpdateInfo) return callback(new CloudronError(CloudronError.ALREADY_UPTODATE, 'No update available'));

    // check if this is just a version number change
    if (config.version().match(/[-+]/) !== null && config.version().replace(/[-+].*/, '') === boxUpdateInfo.version) {
        doShortCircuitUpdate(boxUpdateInfo, function (error) {
            if (error) debug('Short-circuit update failed', error);
        });

        return callback(null);
    }

    if (boxUpdateInfo.upgrade && config.provider() !== 'caas') return callback(new CloudronError(CloudronError.SELF_UPGRADE_NOT_SUPPORTED));

    update(boxUpdateInfo, auditSource, callback);
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

    backups.backupBoxAndApps({ userId: null, username: 'upgrader' }, function (error) {
        if (error) return upgradeError(error);

        superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/upgrade')
          .query({ token: config.token() })
          .send({ version: boxUpdateInfo.version })
          .timeout(30 * 1000)
          .end(function (error, result) {
            if (error && !error.response) return upgradeError(new Error('Network error making upgrade request: ' + error));
            if (result.statusCode !== 202) return upgradeError(new Error(util.format('Server not ready to upgrade. statusCode: %s body: %j', result.status, result.body)));

            progress.set(progress.UPDATE, 10, 'Updating base system');

            // no need to unlock since this is the last thing we ever do on this box
            callback();
            retire('upgrade');
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

    backups.backupBoxAndApps({ userId: null, username: 'updater' }, function (error) {
        if (error) return updateError(error);

        // NOTE: this data is opaque and will be passed through the installer.sh
        var data= {
            provider: config.provider(),
            token: config.token(),
            apiServerOrigin: config.apiServerOrigin(),
            webServerOrigin: config.webServerOrigin(),
            fqdn: config.fqdn(),
            tlsCert: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), 'utf8'),
            tlsKey: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), 'utf8'),
            isCustomDomain: config.isCustomDomain(),
            isDemo: config.isDemo(),

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
        };

        debug('updating box %s %j', boxUpdateInfo.sourceTarballUrl, data);

        shell.sudo('update', [ UPDATE_CMD, boxUpdateInfo.sourceTarballUrl, JSON.stringify(data) ], function (error) {
            if (error) return updateError(error);

            // Do not add any code here. The installer script will stop the box code any instant
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
        debug('autoInstall: installing %s at %s', appInfo.appstoreId, appInfo.location);

        var data = {
            appStoreId: appInfo.appstoreId,
            location: appInfo.location,
            portBindings: appInfo.portBindings || null,
            accessRestriction: appInfo.accessRestriction || null,
        };

        apps.install(data, { userId: null, username: 'autoinstaller' }, iteratorCallback);
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
                   (entry.mount === '/' && entry.available <= (1.25 * 1024 * 1024)); // 1.5G
        });

        debug('Disk space checked. ok: %s', !oos);

        if (oos) mailer.outOfDiskSpace(JSON.stringify(entries, null, 4));

        callback();
    });
}

function retire(reason, info, callback) {
    assert(reason === 'migrate' || reason === 'upgrade');
    info = info || { };
    callback = callback || NOOP_CALLBACK;

    var data = {
        apiServerOrigin: config.apiServerOrigin(),
        isCustomDomain: config.isCustomDomain(),
        fqdn: config.fqdn()
    };
    shell.sudo('retire', [ RETIRE_CMD, reason, JSON.stringify(info), JSON.stringify(data) ], callback);
}

function doMigrate(options, callback) {
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var error = locker.lock(locker.OP_MIGRATE);
    if (error) return callback(new CloudronError(CloudronError.BAD_STATE, error.message));

    function unlock(error) {
        debug('Failed to migrate', error);
        locker.unlock(locker.OP_MIGRATE);
        progress.set(progress.MIGRATE, -1, 'Backup failed: ' + error.message);
    }

    progress.set(progress.MIGRATE, 10, 'Backing up for migration');

    // initiate the migration in the background
    backups.backupBoxAndApps({ userId: null, username: 'migrator' }, function (error, backupId) {
        if (error) return unlock(error);

        debug('migrate: domain: %s size %s region %s', options.domain, options.size, options.region);

        options.restoreKey = backupId;

        superagent
          .post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/migrate')
          .query({ token: config.token() })
          .send(options)
          .timeout(30 * 1000)
          .end(function (error, result) {
            if (error && !error.response) return unlock(error); // network error
            if (result.statusCode === 409) return unlock(new CloudronError(CloudronError.BAD_STATE));
            if (result.statusCode === 404) return unlock(new CloudronError(CloudronError.NOT_FOUND));
            if (result.statusCode !== 202) return unlock(new CloudronError(CloudronError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            progress.set(progress.MIGRATE, 10, 'Migrating');

            retire('migrate', _.pick(options, 'domain', 'size', 'region'));
        });
    });

    callback(null);
}

function migrate(options, callback) {
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (config.isDemo()) return callback(new CloudronError(CloudronError.BAD_FIELD, 'Not allowed in demo mode'));

    if (!options.domain) return doMigrate(options, callback);

    var dnsConfig = _.pick(options, 'domain', 'provider', 'accessKeyId', 'secretAccessKey', 'region', 'endpoint');

    settings.setDnsConfig(dnsConfig, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return callback(new CloudronError(CloudronError.BAD_FIELD, error.message));
        if (error) return callback(new CloudronError(CloudronError.INTERNAL_ERROR, error));

        doMigrate(options, callback);
    });
}
