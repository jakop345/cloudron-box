#!/usr/bin/env node

'use strict';

exports = module.exports = {
    initialize: initialize,
    startTask: startTask,

    // exported for testing
    _reserveHttpPort: reserveHttpPort,
    _configureNginx: configureNginx,
    _unconfigureNginx: unconfigureNginx,
    _createVolume: createVolume,
    _deleteVolume: deleteVolume,
    _allocateOAuthProxyCredentials: allocateOAuthProxyCredentials,
    _removeOAuthProxyCredentials: removeOAuthProxyCredentials,
    _verifyManifest: verifyManifest,
    _registerSubdomain: registerSubdomain,
    _unregisterSubdomain: unregisterSubdomain,
    _waitForDnsPropagation: waitForDnsPropagation,
    _waitForAltDomainDnsPropagation: waitForAltDomainDnsPropagation
};

require('supererror')({ splatchError: true });

// remove timestamp from debug() based output
require('debug').formatArgs = function formatArgs() {
    arguments[0] = this.namespace + ' ' + arguments[0];
    return arguments;
};

var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    backups = require('./backups.js'),
    certificates = require('./certificates.js'),
    clients = require('./clients.js'),
    config = require('./config.js'),
    ClientsError = clients.ClientsError,
    database = require('./database.js'),
    debug = require('debug')('box:apptask'),
    docker = require('./docker.js'),
    ejs = require('ejs'),
    fs = require('fs'),
    manifestFormat = require('cloudron-manifestformat'),
    net = require('net'),
    nginx = require('./nginx.js'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    SubdomainError = require('./subdomains.js').SubdomainError,
    subdomains = require('./subdomains.js'),
    superagent = require('superagent'),
    sysinfo = require('./sysinfo.js'),
    util = require('util'),
    waitForDns = require('./waitfordns.js'),
    _ = require('underscore');

var COLLECTD_CONFIG_EJS = fs.readFileSync(__dirname + '/collectd.config.ejs', { encoding: 'utf8' }),
    RELOAD_COLLECTD_CMD = path.join(__dirname, 'scripts/reloadcollectd.sh'),
    RMAPPDIR_CMD = path.join(__dirname, 'scripts/rmappdir.sh'),
    CREATEAPPDIR_CMD = path.join(__dirname, 'scripts/createappdir.sh');

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.initialize(callback);
}

function debugApp(app) {
    assert.strictEqual(typeof app, 'object');

    var prefix = app ? (app.location || '(bare)') : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

function reserveHttpPort(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var server = net.createServer();
    server.listen(0, function () {
        var port = server.address().port;
        updateApp(app, { httpPort: port }, function (error) {
            if (error) {
                server.close();
                return callback(error);
            }

            server.close(callback);
        });
    });
}

function configureNginx(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    certificates.ensureCertificate(app, function (error, certFilePath, keyFilePath) {
        if (error) return callback(error);

        nginx.configureApp(app, certFilePath, keyFilePath, callback);
    });
}

function unconfigureNginx(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    // TODO: maybe revoke the cert
    nginx.unconfigureApp(app, callback);
}

function createContainer(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');
    assert(!app.containerId); // otherwise, it will trigger volumeFrom

    debugApp(app, 'creating container');

    docker.createContainer(app, function (error, container) {
        if (error) return callback(new Error('Error creating container: ' + error));

        updateApp(app, { containerId: container.id }, callback);
    });
}

function deleteContainers(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'deleting containers');

    docker.deleteContainers(app.id, function (error) {
        if (error) return callback(new Error('Error deleting container: ' + error));

        updateApp(app, { containerId: null }, callback);
    });
}

function createVolume(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    shell.sudo('createVolume', [ CREATEAPPDIR_CMD, app.id ], callback);
}

function deleteVolume(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    shell.sudo('deleteVolume', [ RMAPPDIR_CMD, app.id ], callback);
}

function allocateOAuthProxyCredentials(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!nginx.requiresOAuthProxy(app)) return callback(null);

    var redirectURI = 'https://' + config.appFqdn(app.location);
    var scope = 'profile';

    clients.add(app.id, clients.TYPE_PROXY, redirectURI, scope, callback);
}

function removeOAuthProxyCredentials(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    clients.delByAppIdAndType(app.id, clients.TYPE_PROXY, function (error) {
        if (error && error.reason !== ClientsError.NOT_FOUND) {
            debugApp(app, 'Error removing OAuth client id', error);
            return callback(error);
        }

        callback(null);
    });
}

function addCollectdProfile(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var collectdConf = ejs.render(COLLECTD_CONFIG_EJS, { appId: app.id, containerId: app.containerId });
    fs.writeFile(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), collectdConf, function (error) {
        if (error) return callback(error);
        shell.sudo('addCollectdProfile', [ RELOAD_COLLECTD_CMD ], callback);
    });
}

function removeCollectdProfile(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    fs.unlink(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), function (error) {
        if (error && error.code !== 'ENOENT') debugApp(app, 'Error removing collectd profile', error);
        shell.sudo('removeCollectdProfile', [ RELOAD_COLLECTD_CMD ], callback);
    });
}

function verifyManifest(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Verifying manifest');

    var manifest = app.manifest;
    var error = manifestFormat.parse(manifest);
    if (error) return callback(new Error(util.format('Manifest error: %s', error.message)));

    error = apps.checkManifestConstraints(manifest);
    if (error) return callback(error);

    return callback(null);
}

function downloadIcon(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Downloading icon of %s@%s', app.appStoreId, app.manifest.version);

    var iconUrl = config.apiServerOrigin() + '/api/v1/apps/' + app.appStoreId + '/versions/' + app.manifest.version + '/icon';

    async.retry({ times: 10, interval: 5000 }, function (retryCallback) {
        superagent
            .get(iconUrl)
            .buffer(true)
            .end(function (error, res) {
                if (error && !error.response) return retryCallback(new Error('Network error downloading icon:' + error.message));
                if (res.statusCode !== 200) return retryCallback(null); // ignore error. this can also happen for apps installed with cloudron-cli

                if (!safe.fs.writeFileSync(path.join(paths.APPICONS_DIR, app.id + '.png'), res.body)) return retryCallback(new Error('Error saving icon:' + safe.error.message));

                retryCallback(null);
        });
    }, callback);
}

function registerSubdomain(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    sysinfo.getIp(function (error, ip) {
        if (error) return callback(error);

        // even though the bare domain is already registered in the appstore, we still
        // need to register it so that we have a dnsRecordId to wait for it to complete
        async.retry({ times: 200, interval: 5000 }, function (retryCallback) {
            debugApp(app, 'Registering subdomain location [%s]', app.location);

            subdomains.add(app.location, 'A', [ ip ], function (error, changeId) {
                if (error && (error.reason === SubdomainError.STILL_BUSY || error.reason === SubdomainError.EXTERNAL_ERROR)) return retryCallback(error); // try again

                retryCallback(null, error || changeId);
            });
        }, function (error, result) {
            if (error || result instanceof Error) return callback(error || result);

            updateApp(app, { dnsRecordId: result }, callback);
        });
    });
}

function unregisterSubdomain(app, location, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof location, 'string');
    assert.strictEqual(typeof callback, 'function');

    // do not unregister bare domain because we show a error/cloudron info page there
    if (location === '') {
        debugApp(app, 'Skip unregister of empty subdomain');
        return callback(null);
    }

    sysinfo.getIp(function (error, ip) {
        if (error) return callback(error);

        async.retry({ times: 30, interval: 5000 }, function (retryCallback) {
            debugApp(app, 'Unregistering subdomain: %s', location);

            subdomains.remove(location, 'A', [ ip ], function (error) {
                if (error && (error.reason === SubdomainError.STILL_BUSY || error.reason === SubdomainError.EXTERNAL_ERROR)) return retryCallback(error); // try again

                retryCallback(null, error);
            });
        }, function (error, result) {
            if (error || result instanceof Error) return callback(error || result);

            updateApp(app, { dnsRecordId: null }, callback);
        });
    });
}

function removeIcon(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    fs.unlink(path.join(paths.APPICONS_DIR, app.id + '.png'), function (error) {
        if (error && error.code !== 'ENOENT') debugApp(app, 'cannot remove icon : %s', error);
        callback(null);
    });
}

function waitForDnsPropagation(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!config.CLOUDRON) {
        debugApp(app, 'Skipping dns propagation check for development');
        return callback(null);
    }

    async.retry({ interval: 5000, times: 120 }, function checkStatus(retryCallback) {
        subdomains.status(app.dnsRecordId, function (error, result) {
            if (error) return retryCallback(new Error('Failed to get dns record status : ' + error.message));

            debugApp(app, 'waitForDnsPropagation: dnsRecordId:%s status:%s', app.dnsRecordId, result);

            if (result !== 'done') return retryCallback(new Error(util.format('app:%s not ready yet: %s', app.id, result)));

            retryCallback(null, result);
        });
    }, callback);
}

function waitForAltDomainDnsPropagation(app, callback) {
    if (!app.altDomain) return callback(null);

    waitForDns(app.altDomain, config.appFqdn(app.location), 'CNAME', callback); // waits forever
}

// updates the app object and the database
function updateApp(app, values, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof values, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'updating app with values: %j', values);

    appdb.update(app.id, values, function (error) {
        if (error) return callback(error);

        for (var value in values) {
            app[value] = values[value];
        }

        return callback(null);
    });
}

// Ordering is based on the following rationale:
//   - configure nginx, icon, oauth
//   - register subdomain.
//          at this point, the user can visit the site and the above nginx config can show some install screen.
//          the icon can be displayed in this nginx page and oauth proxy means the page can be protected
//   - download image
//   - setup volumes
//   - setup addons (requires the above volume)
//   - setup the container (requires image, volumes, addons)
//   - setup collectd (requires container id)
function install(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    async.series([
        verifyManifest.bind(null, app),

        // teardown for re-installs
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        unconfigureNginx.bind(null, app),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainers.bind(null, app),
        addons.teardownAddons.bind(null, app, app.manifest.addons),
        deleteVolume.bind(null, app),
        unregisterSubdomain.bind(null, app, app.location),
        removeOAuthProxyCredentials.bind(null, app),
        // removeIcon.bind(null, app), // do not remove icon for non-appstore installs

        reserveHttpPort.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Downloading icon' }),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '25, Creating OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Registering subdomain' }),
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '40, Downloading image' }),
        docker.downloadImage.bind(null, app.manifest),

        updateApp.bind(null, app, { installationProgress: '50, Creating volume' }),
        createVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '60, Setting up addons' }),
        addons.setupAddons.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '70, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Setting up collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '85, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Waiting for Alt Domain DNS propagation' }),
        exports._waitForAltDomainDnsPropagation.bind(null, app), // required when restoring and !lastBackupId

        updateApp.bind(null, app, { installationProgress: '95, Configure nginx' }),
        configureNginx.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'installed');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '', health: null }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'error installing app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

function backup(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    async.series([
        updateApp.bind(null, app, { installationProgress: '10, Backing up' }),
        backups.backupApp.bind(null, app, app.manifest),

        // done!
        function (callback) {
            debugApp(app, 'installed');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'error backing up app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: error.message }, callback.bind(null, error)); // return to installed state intentionally
        }
        callback(null);
    });
}

// restore is also called for upgrades and infra updates. note that in those cases it is possible there is no backup
function restore(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    // we don't have a backup, same as re-install. this allows us to install from install failures (update failures always
    // have a backupId)
    if (!app.lastBackupId) {
        debugApp(app, 'No lastBackupId. reinstalling');
        return install(app, callback);
    }

    var backupId = app.lastBackupId;

    async.series([
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        unconfigureNginx.bind(null, app),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainers.bind(null, app),
         // oldConfig can be null during upgrades
        addons.teardownAddons.bind(null, app, app.oldConfig ? app.oldConfig.manifest.addons : null),
        deleteVolume.bind(null, app),
        function deleteImageIfChanged(done) {
             if (!app.oldConfig || (app.oldConfig.manifest.dockerImage === app.manifest.dockerImage)) return done();

             docker.deleteImage(app.oldConfig.manifest, done);
        },
        removeOAuthProxyCredentials.bind(null, app),
        removeIcon.bind(null, app),

        reserveHttpPort.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '40, Downloading icon' }),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '50, Create OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '55, Registering subdomain' }), // ip might change during upgrades
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '60, Downloading image' }),
        docker.downloadImage.bind(null, app.manifest),

        updateApp.bind(null, app, { installationProgress: '65, Creating volume' }),
        createVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '70, Download backup and restore addons' }),
        backups.restoreApp.bind(null, app, app.manifest.addons, backupId),

        updateApp.bind(null, app, { installationProgress: '75, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Setting up collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '85, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Waiting for Alt Domain DNS propagation' }),
        exports._waitForAltDomainDnsPropagation.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '95, Configuring Nginx' }),
        configureNginx.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'restored');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '', health: null }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'Error installing app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }

        callback(null);
    });
}

// note that configure is called after an infra update as well
function configure(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    async.series([
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        unconfigureNginx.bind(null, app),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainers.bind(null, app),
        function (next) {
            // oldConfig can be null during an infra update
            if (!app.oldConfig || app.oldConfig.location === app.location) return next();
            unregisterSubdomain(app, app.oldConfig.location, next);
        },
        removeOAuthProxyCredentials.bind(null, app),

        reserveHttpPort.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Create OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '35, Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // re-setup addons since they rely on the app's fqdn (e.g oauth)
        updateApp.bind(null, app, { installationProgress: '50, Setting up addons' }),
        addons.setupAddons.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '60, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '70, Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '85, Waiting for Alt Domain DNS propagation' }),
        exports._waitForAltDomainDnsPropagation.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Configuring Nginx' }),
        configureNginx.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'configured');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '', health: null }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'error reconfiguring : %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

// nginx configuration is skipped because app.httpPort is expected to be available
function update(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Updating to %s', safe.query(app, 'manifest.version'));

    // app does not want these addons anymore
    // FIXME: this does not handle option changes (like multipleDatabases)
    var unusedAddons = _.omit(app.oldConfig.manifest.addons, Object.keys(app.manifest.addons));

    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Verify manifest' }),
        verifyManifest.bind(null, app),

        // download new image before app is stopped. this is so we can reduce downtime
        // and also not remove the 'common' layers when the old image is deleted
        updateApp.bind(null, app, { installationProgress: '15, Downloading image' }),
        docker.downloadImage.bind(null, app.manifest),

        // note: we cleanup first and then backup. this is done so that the app is not running should backup fail
        // we cannot easily 'recover' from backup failures because we have to revert manfest and portBindings
        updateApp.bind(null, app, { installationProgress: '25, Cleaning up old install' }),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainers.bind(null, app),
        function deleteImageIfChanged(done) {
             if (app.oldConfig.manifest.dockerImage === app.manifest.dockerImage) return done();

             docker.deleteImage(app.oldConfig.manifest, done);
        },
        // removeIcon.bind(null, app), // do not remove icon, otherwise the UI breaks for a short time...

        function (next) {
            if (app.installationState === appdb.ISTATE_PENDING_FORCE_UPDATE) return next(null);

            async.series([
                updateApp.bind(null, app, { installationProgress: '30, Backup app' }),
                backups.backupApp.bind(null, app, app.oldConfig.manifest)
            ], next);
        },

        // only delete unused addons after backup
        addons.teardownAddons.bind(null, app, unusedAddons),

        updateApp.bind(null, app, { installationProgress: '45, Downloading icon' }),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '70, Updating addons' }),
        addons.setupAddons.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '80, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'updated');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '', health: null }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'Error updating app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

function uninstall(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'uninstalling');

    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Remove collectd profile' }),
        removeCollectdProfile.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '10, Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Deleting container' }),
        deleteContainers.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Teardown addons' }),
        addons.teardownAddons.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '40, Deleting volume' }),
        deleteVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '50, Deleting image' }),
        docker.deleteImage.bind(null, app.manifest),

        updateApp.bind(null, app, { installationProgress: '60, Unregistering subdomain' }),
        unregisterSubdomain.bind(null, app, app.location),

        updateApp.bind(null, app, { installationProgress: '70, Remove OAuth credentials' }),
        removeOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Cleanup icon' }),
        removeIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Unconfiguring Nginx' }),
        unconfigureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '95, Remove app from database' }),
        appdb.del.bind(null, app.id)
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'error uninstalling app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

function runApp(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    docker.startContainer(app.containerId, function (error) {
        if (error) return callback(error);

        updateApp(app, { runState: appdb.RSTATE_RUNNING }, callback);
    });
}

function stopApp(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    docker.stopContainers(app.id, function (error) {
        if (error) return callback(error);

        updateApp(app, { runState: appdb.RSTATE_STOPPED, health: null }, callback);
    });
}

function handleRunCommand(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (app.runState === appdb.RSTATE_PENDING_STOP) {
        return stopApp(app, callback);
    }

    if (app.runState === appdb.RSTATE_PENDING_START || app.runState === appdb.RSTATE_RUNNING) {
        debugApp(app, 'Resuming app with state : %s', app.runState);
        return runApp(app, callback);
    }

    debugApp(app, 'handleRunCommand - doing nothing: %s', app.runState);

    return callback(null);
}

function startTask(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    // determine what to do
    appdb.get(appId, function (error, app) {
        if (error) return callback(error);

        debugApp(app, 'startTask installationState: %s runState: %s', app.installationState, app.runState);

        switch (app.installationState) {
        case appdb.ISTATE_PENDING_UNINSTALL: return uninstall(app, callback);
        case appdb.ISTATE_PENDING_CONFIGURE: return configure(app, callback);
        case appdb.ISTATE_PENDING_UPDATE: return update(app, callback);
        case appdb.ISTATE_PENDING_RESTORE: return restore(app, callback);
        case appdb.ISTATE_PENDING_BACKUP: return backup(app, callback);
        case appdb.ISTATE_INSTALLED: return handleRunCommand(app, callback);
        case appdb.ISTATE_PENDING_INSTALL: return install(app, callback);
        case appdb.ISTATE_PENDING_FORCE_UPDATE: return update(app, callback);
        case appdb.ISTATE_ERROR:
            debugApp(app, 'Internal error. apptask launched with error status.');
            return callback(null);
        default:
            debugApp(app, 'apptask launched with invalid command');
            return callback(new Error('Unknown command in apptask:' + app.installationState));
        }
    });
}

if (require.main === module) {
    assert.strictEqual(process.argv.length, 3, 'Pass the appid as argument');

    debug('Apptask for %s', process.argv[2]);

    initialize(function (error) {
        if (error) throw error;

        startTask(process.argv[2], function (error) {
            if (error) debug('Apptask completed with error', error);

            debug('Apptask completed for %s', process.argv[2]);
            // https://nodejs.org/api/process.html are exit codes used by node. apps.js uses the value below
            // to check apptask crashes
            process.exit(error ? 50 : 0);
        });
    });
}
