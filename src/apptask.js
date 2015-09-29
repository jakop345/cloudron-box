#!/usr/bin/env node

/* jslint node:true */

'use strict';

exports = module.exports = {
    initialize: initialize,
    startTask: startTask,

    // exported for testing
    _getFreePort: getFreePort,
    _configureNginx: configureNginx,
    _unconfigureNginx: unconfigureNginx,
    _createVolume: createVolume,
    _deleteVolume: deleteVolume,
    _allocateOAuthProxyCredentials: allocateOAuthProxyCredentials,
    _removeOAuthProxyCredentials: removeOAuthProxyCredentials,
    _verifyManifest: verifyManifest,
    _registerSubdomain: registerSubdomain,
    _unregisterSubdomain: unregisterSubdomain,
    _reloadNginx: reloadNginx,
    _waitForDnsPropagation: waitForDnsPropagation
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
    clientdb = require('./clientdb.js'),
    config = require('./config.js'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apptask'),
    docker = require('./docker.js'),
    ejs = require('ejs'),
    fs = require('fs'),
    hat = require('hat'),
    manifestFormat = require('cloudron-manifestformat'),
    net = require('net'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    SubdomainError = require('./subdomainerror.js'),
    subdomains = require('./subdomains.js'),
    superagent = require('superagent'),
    sysinfo = require('./sysinfo.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    vbox = require('./vbox.js'),
    _ = require('underscore');

var NGINX_APPCONFIG_EJS = fs.readFileSync(__dirname + '/../setup/start/nginx/appconfig.ejs', { encoding: 'utf8' }),
    COLLECTD_CONFIG_EJS = fs.readFileSync(__dirname + '/collectd.config.ejs', { encoding: 'utf8' }),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    RELOAD_COLLECTD_CMD = path.join(__dirname, 'scripts/reloadcollectd.sh'),
    RMAPPDIR_CMD = path.join(__dirname, 'scripts/rmappdir.sh'),
    CREATEAPPDIR_CMD = path.join(__dirname, 'scripts/createappdir.sh');

function initialize(callback) {
    database.initialize(callback);
}

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? (app.location || '(bare)') : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

// We expect conflicts to not happen despite closing the port (parallel app installs, app update does not reconfigure nginx etc)
// https://tools.ietf.org/html/rfc6056#section-3.5 says linux uses random ephemeral port allocation
function getFreePort(callback) {
    var server = net.createServer();
    server.listen(0, function () {
        var port = server.address().port;
        server.close(function () {
            return callback(null, port);
        });
    });
}

function reloadNginx(callback) {
    shell.sudo('reloadNginx', [ RELOAD_NGINX_CMD ], callback);
}

function configureNginx(app, callback) {
    getFreePort(function (error, freePort) {
        if (error) return callback(error);

        var sourceDir = path.resolve(__dirname, '..');
        var endpoint = app.accessRestriction ? 'oauthproxy' : 'app';
        var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, adminOrigin: config.adminOrigin(), vhost: config.appFqdn(app.location), port: freePort, endpoint: endpoint });

        var nginxConfigFilename = path.join(paths.NGINX_APPCONFIG_DIR, app.id + '.conf');
        debugApp(app, 'writing config to %s', nginxConfigFilename);

        if (!safe.fs.writeFileSync(nginxConfigFilename, nginxConf)) {
            debugApp(app, 'Error creating nginx config : %s', safe.error.message);
            return callback(safe.error);
        }

        async.series([
            exports._reloadNginx,
            updateApp.bind(null, app, { httpPort: freePort })
        ], callback);

        vbox.forwardFromHostToVirtualBox(app.id + '-http', freePort);
    });
}

function unconfigureNginx(app, callback) {
    var nginxConfigFilename = path.join(paths.NGINX_APPCONFIG_DIR, app.id + '.conf');
    if (!safe.fs.unlinkSync(nginxConfigFilename)) {
        debugApp(app, 'Error removing nginx configuration : %s', safe.error.message);
        return callback(null);
    }

    exports._reloadNginx(callback);

    vbox.unforwardFromHostToVirtualBox(app.id + '-http');
}

function pullImage(app, callback) {
    docker.pull(app.manifest.dockerImage, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker. statusCode: %s' + err.statusCode));

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debugApp(app, 'downloadImage data: %j', data);

            // The information here is useless because this is per layer as opposed to per image
            if (data.status) {
                debugApp(app, 'progress: %s', data.status); // progressDetail { current, total }
            } else if (data.error) {
                debugApp(app, 'error detail: %s', data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debugApp(app, 'download image successfully');

            var image = docker.getImage(app.manifest.dockerImage);

            image.inspect(function (err, data) {
                if (err) return callback(new Error('Error inspecting image:' + err.message));
                if (!data || !data.Config) return callback(new Error('Missing Config in image:' + JSON.stringify(data, null, 4)));
                if (!data.Config.Entrypoint && !data.Config.Cmd) return callback(new Error('Only images with entry point are allowed'));

                debugApp(app, 'This image exposes ports: %j', data.Config.ExposedPorts);

                callback(null);
            });
        });
    });
}

function downloadImage(app, callback) {
    debugApp(app, 'downloadImage %s', app.manifest.dockerImage);

    var attempt = 1;

    async.retry({ times: 5, interval: 15000 }, function (retryCallback) {
        debugApp(app, 'Downloading image. attempt: %s', attempt++);

        pullImage(app, retryCallback);
    }, callback);
}

function createContainer(app, callback) {
    appdb.getPortBindings(app.id, function (error, portBindings) {
        if (error) return callback(error);

        var manifest = app.manifest;
        var exposedPorts = {};
        var env = [];

        // docker portBindings requires ports to be exposed
        exposedPorts[manifest.httpPort + '/tcp'] = {};

        for (var e in portBindings) {
            var hostPort = portBindings[e];
            var containerPort = manifest.tcpPorts[e].containerPort || hostPort;
            exposedPorts[containerPort + '/tcp'] = {};

            env.push(e + '=' + hostPort);
        }

        env.push('CLOUDRON=1');
        env.push('WEBADMIN_ORIGIN' + '=' + config.adminOrigin());
        env.push('API_ORIGIN' + '=' + config.adminOrigin());

        addons.getEnvironment(app, function (error, addonEnv) {
            if (error) return callback(new Error('Error getting addon env: ' + error));

            var containerOptions = {
                name: app.id,
                Hostname: config.appFqdn(app.location),
                Tty: true,
                Image: app.manifest.dockerImage,
                Cmd: null,
                Env: env.concat(addonEnv),
                ExposedPorts: exposedPorts
            };

            debugApp(app, 'Creating container for %s', app.manifest.dockerImage);

            docker.createContainer(containerOptions, function (error, container) {
                if (error) return callback(new Error('Error creating container: ' + error));

                updateApp(app, { containerId: container.id }, callback);
            });
        });
    });
}

function deleteContainer(app, callback) {
    if (app.containerId === null) return callback(null);

    var container = docker.getContainer(app.containerId);

    var removeOptions = {
        force: true, // kill container if it's running
        v: false // removes volumes associated with the container
    };

    container.remove(removeOptions, function (error) {
        if (error && error.statusCode === 404) return updateApp(app, { containerId: null }, callback);

        if (error) debugApp(app, 'Error removing container', error);
        callback(error);
    });
}

function deleteImage(app, manifest, callback) {
    var dockerImage = manifest ? manifest.dockerImage : null;
    if (!dockerImage) return callback(null);

    docker.getImage(dockerImage).inspect(function (error, result) {
        if (error && error.statusCode === 404) return callback(null);

        if (error) return callback(error);

        var removeOptions = {
            force: true,
            noprune: false
        };

         // delete image by id because 'docker pull' pulls down all the tags and this is the only way to delete all tags
        docker.getImage(result.Id).remove(removeOptions, function (error) {
            if (error && error.statusCode === 404) return callback(null);
            if (error && error.statusCode === 409) return callback(null); // another container using the image

            if (error) debugApp(app, 'Error removing image', error);

            callback(error);
        });
    });
}

function createVolume(app, callback) {
    shell.sudo('createVolume', [ CREATEAPPDIR_CMD, app.id ], callback);
}

function deleteVolume(app, callback) {
    shell.sudo('deleteVolume', [ RMAPPDIR_CMD, app.id ], callback);
}

function allocateOAuthProxyCredentials(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!app.accessRestriction) return callback(null);

    var appId = 'proxy-' + app.id;
    var id = 'cid-proxy-' + uuid.v4();
    var clientSecret = hat(256);
    var redirectURI = 'https://' + config.appFqdn(app.location);
    var scope = 'profile,' + app.accessRestriction;

    clientdb.add(id, appId, clientSecret, redirectURI, scope, callback);
}

function removeOAuthProxyCredentials(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    clientdb.delByAppId('proxy-' + app.id, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) {
            debugApp(app, 'Error removing OAuth client id', error);
            return callback(error);
        }

        callback(null);
    });
}

function addCollectdProfile(app, callback) {
    var collectdConf = ejs.render(COLLECTD_CONFIG_EJS, { appId: app.id, containerId: app.containerId });
    fs.writeFile(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), collectdConf, function (error) {
        if (error) return callback(error);
        shell.sudo('addCollectdProfile', [ RELOAD_COLLECTD_CMD ], callback);
    });
}

function removeCollectdProfile(app, callback) {
    fs.unlink(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), function (error) {
        if (error && error.code !== 'ENOENT') debugApp(app, 'Error removing collectd profile', error);
        shell.sudo('removeCollectdProfile', [ RELOAD_COLLECTD_CMD ], callback);
    });
}

function startContainer(app, callback) {
    appdb.getPortBindings(app.id, function (error, portBindings) {
        if (error) return callback(error);

        var manifest = app.manifest;

        var dockerPortBindings = { };
        var isMac = os.platform() === 'darwin';

        // On Mac (boot2docker), we have to export the port to external world for port forwarding from Mac to work
        dockerPortBindings[manifest.httpPort + '/tcp'] = [ { HostIp: isMac ? '0.0.0.0' : '127.0.0.1', HostPort: app.httpPort + '' } ];

        for (var env in portBindings) {
            var hostPort = portBindings[env];
            var containerPort = manifest.tcpPorts[env].containerPort || hostPort;
            dockerPortBindings[containerPort + '/tcp'] = [ { HostIp: '0.0.0.0', HostPort: hostPort + '' } ];
            vbox.forwardFromHostToVirtualBox(app.id + '-tcp' + containerPort, hostPort);
        }

        var memoryLimit = manifest.memoryLimit || 1024 * 1024 * 200; // 200mb by default

        var startOptions = {
            Binds: addons.getBindsSync(app, app.manifest.addons),
            Memory: memoryLimit / 2,
            MemorySwap: memoryLimit, // Memory + Swap
            PortBindings: dockerPortBindings,
            PublishAllPorts: false,
            Links: addons.getLinksSync(app, app.manifest.addons),
            RestartPolicy: {
                "Name": "always",
                "MaximumRetryCount": 0
            },
            CpuShares: 512, // relative to 1024 for system processes
            SecurityOpt: config.CLOUDRON ? [ "apparmor:docker-cloudron-app" ] : null // profile available only on cloudron
        };

        var container = docker.getContainer(app.containerId);
        debugApp(app, 'Starting container %s with options: %j', container.id, JSON.stringify(startOptions));

        container.start(startOptions, function (error, data) {
            if (error && error.statusCode !== 304) return callback(new Error('Error starting container:' + error));

            return callback(null);
        });
    });
}

function stopContainer(app, callback) {
    if (!app.containerId) {
        debugApp(app, 'No previous container to stop');
        return callback();
    }

    var container = docker.getContainer(app.containerId);
    debugApp(app, 'Stopping container %s', container.id);

    var options = {
        t: 10 // wait for 10 seconds before killing it
    };

    container.stop(options, function (error) {
        if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error stopping container:' + error));

        var tcpPorts = safe.query(app, 'manifest.tcpPorts', { });
        for (var containerPort in tcpPorts) {
            vbox.unforwardFromHostToVirtualBox(app.id + '-tcp' + containerPort);
        }

        debugApp(app, 'Waiting for container ' + container.id);

        container.wait(function (error, data) {
            if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error waiting on container:' + error));

            debugApp(app, 'Container stopped with status code [%s]', data ? String(data.StatusCode) : '');

            return callback(null);
        });
    });
}

function verifyManifest(app, callback) {
    debugApp(app, 'Verifying manifest');

    var manifest = app.manifest;
    var error = manifestFormat.parse(manifest);
    if (error) return callback(new Error(util.format('Manifest error: %s', error.message)));

    error = apps.checkManifestConstraints(manifest);
    if (error) return callback(error);

    return callback(null);
}

function downloadIcon(app, callback) {
    debugApp(app, 'Downloading icon of %s@%s', app.appStoreId, app.manifest.version);

    var iconUrl = config.apiServerOrigin() + '/api/v1/apps/' + app.appStoreId + '/versions/' + app.manifest.version + '/icon';

    superagent
        .get(iconUrl)
        .buffer(true)
        .end(function (error, res) {
            if (error) return callback(new Error('Error downloading icon:' + error.message));
            if (res.status !== 200) return callback(null); // ignore error. this can also happen for apps installed with cloudron-cli

            if (!safe.fs.writeFileSync(path.join(paths.APPICONS_DIR, app.id + '.png'), res.body)) return callback(new Error('Error saving icon:' + safe.error.message));

            callback(null);
    });
}

function registerSubdomain(app, callback) {
    // even though the bare domain is already registered in the appstore, we still
    // need to register it so that we have a dnsRecordId to wait for it to complete
    var record = { subdomain: app.location, type: 'A', value: sysinfo.getIp() };

    async.retry({ times: 200, interval: 5000 }, function (retryCallback) {
        debugApp(app, 'Registering subdomain location [%s]', app.location);

        subdomains.add(record, function (error, changeId) {
            if (error && (error.reason === SubdomainError.STILL_BUSY || error.reason === SubdomainError.EXTERNAL_ERROR)) return retryCallback(error); // try again

            retryCallback(null, error || changeId);
        });
    }, function (error, result) {
        if (error || result instanceof Error) return callback(error || result);

        updateApp(app, { dnsRecordId: result }, callback);
    });
}

function unregisterSubdomain(app, location, callback) {
    // do not unregister bare domain because we show a error/cloudron info page there
    if (location === '') {
        debugApp(app, 'Skip unregister of empty subdomain');
        return callback(null);
    }

    var record = { subdomain: location, type: 'A', value: sysinfo.getIp() };

    async.retry({ times: 30, interval: 5000 }, function (retryCallback) {
        debugApp(app, 'Unregistering subdomain: %s', location);

        subdomains.remove(record, function (error) {
            if (error && (error.reason === SubdomainError.STILL_BUSY || error.reason === SubdomainError.EXTERNAL_ERROR))return retryCallback(error); // try again

            retryCallback(error);
        });
    }, function (error) {
        if (error) debugApp(app, 'Error unregistering subdomain: %s', error);

        updateApp(app, { dnsRecordId: null }, callback);
    });
}

function removeIcon(app, callback) {
    fs.unlink(path.join(paths.APPICONS_DIR, app.id + '.png'), function (error) {
        if (error && error.code !== 'ENOENT') debugApp(app, 'cannot remove icon : %s', error);
        callback(null);
    });
}

function waitForDnsPropagation(app, callback) {
    if (!config.CLOUDRON) {
        debugApp(app, 'Skipping dns propagation check for development');
        return callback(null);
    }

    function retry(error) {
        debugApp(app, 'waitForDnsPropagation: ', error);
        setTimeout(waitForDnsPropagation.bind(null, app, callback), 5000);
    }

    subdomains.status(app.dnsRecordId, function (error, result) {
        if (error) return retry(new Error('Failed to get dns record status : ' + error.message));

        debugApp(app, 'waitForDnsPropagation: dnsRecordId:%s status:%s', app.dnsRecordId, result);

        if (result !== 'done') return retry(new Error(util.format('app:%s not ready yet: %s', app.id, result)));

        callback(null);
    });
}

// updates the app object and the database
function updateApp(app, values, callback) {
    debugApp(app, 'installationState: %s progress: %s', app.installationState, app.installationProgress);

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
    async.series([
        verifyManifest.bind(null, app),

        // teardown for re-installs
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainer.bind(null, app),
        addons.teardownAddons.bind(null, app, app.manifest.addons),
        deleteVolume.bind(null, app),
        unregisterSubdomain.bind(null, app, app.location),
        removeOAuthProxyCredentials.bind(null, app),
        // removeIcon.bind(null, app), // do not remove icon for non-appstore installs
        unconfigureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '15, Configure nginx' }),
        configureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Downloading icon' }),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '25, Creating OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Registering subdomain' }),
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '40, Downloading image' }),
        downloadImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '50, Creating volume' }),
        createVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '60, Setting up addons' }),
        addons.setupAddons.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '70, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Setting up collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

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
    async.series([
        updateApp.bind(null, app, { installationProgress: '10, Backing up' }),
        apps.backupApp.bind(null, app, app.manifest.addons),

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
    // we don't have a backup, same as re-install. this allows us to install from install failures (update failures always
    // have a backupId)
    if (!app.lastBackupId) {
        debugApp(app, 'No lastBackupId. reinstalling');
        return install(app, callback);
    }

    async.series([
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainer.bind(null, app),
         // oldConfig can be null during upgrades
        addons.teardownAddons.bind(null, app, app.oldConfig ? app.oldConfig.manifest.addons : null),
        deleteVolume.bind(null, app),
        function deleteImageIfChanged(done) {
             if (!app.oldConfig || (app.oldConfig.manifest.dockerImage === app.manifest.dockerImage)) return done();

             deleteImage(app, app.oldConfig.manifest, done);
        },
        removeOAuthProxyCredentials.bind(null, app),
        removeIcon.bind(null, app),
        unconfigureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Configuring Nginx' }),
        configureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '40, Downloading icon' }),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '50, Create OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '55, Registering subdomain' }), // ip might change during upgrades
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '60, Downloading image' }),
        downloadImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '65, Creating volume' }),
        createVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '70, Download backup and restore addons' }),
        apps.restoreApp.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '75, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Setting up collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

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
    async.series([
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainer.bind(null, app),
        function (next) {
            // oldConfig can be null during an infra update. location can be null when infra updated for an updated app
            if (!app.oldConfig || !app.oldConfig.location || app.oldConfig.location === app.location) return next();
            unregisterSubdomain(app, app.oldConfig.location, next);
        },
        removeOAuthProxyCredentials.bind(null, app),
        unconfigureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '25, Configuring Nginx' }),
        configureNginx.bind(null, app),

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
    debugApp(app, 'Updating to %s', safe.query(app, 'manifest.version'));

    // app does not want these addons anymore
    var unusedAddons = _.omit(app.oldConfig.manifest.addons, Object.keys(app.manifest.addons));

    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Verify manifest' }),
        verifyManifest.bind(null, app),

        // note: we cleanup first and then backup. this is done so that the app is not running should backup fail
        // we cannot easily 'recover' from backup failures because we have to revert manfest and portBindings
        updateApp.bind(null, app, { installationProgress: '10, Cleaning up old install' }),
        removeCollectdProfile.bind(null, app),
        stopApp.bind(null, app),
        deleteContainer.bind(null, app),
        addons.teardownAddons.bind(null, app, unusedAddons),
        function deleteImageIfChanged(done) {
             if (app.oldConfig.manifest.dockerImage === app.manifest.dockerImage) return done();

             deleteImage(app, app.oldConfig.manifest, done);
        },
        // removeIcon.bind(null, app), // do not remove icon, otherwise the UI breaks for a short time...

        function (next) {
            if (app.installationState === appdb.ISTATE_PENDING_FORCE_UPDATE) return next(null);

            async.series([
                updateApp.bind(null, app, { installationProgress: '20, Backup app' }),
                apps.backupApp.bind(null, app, app.oldConfig.manifest.addons)
            ], next);
        },

        updateApp.bind(null, app, { installationProgress: '35, Downloading icon' }),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '45, Downloading image' }),
        downloadImage.bind(null, app),

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
    debugApp(app, 'uninstalling');

    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Remove collectd profile' }),
        removeCollectdProfile.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '10, Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Teardown addons' }),
        addons.teardownAddons.bind(null, app, app.manifest.addons),

        updateApp.bind(null, app, { installationProgress: '40, Deleting volume' }),
        deleteVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '50, Deleting image' }),
        deleteImage.bind(null, app, app.manifest),

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
    ], callback);
}

function runApp(app, callback) {
    startContainer(app, function (error) {
        if (error) {
            debugApp(app, 'Error starting container : %s', error);
            return updateApp(app, { runState: appdb.RSTATE_ERROR }, callback);
        }

        updateApp(app, { runState: appdb.RSTATE_RUNNING }, callback);
    });
}

function stopApp(app, callback) {
    stopContainer(app, function (error) {
        if (error) return callback(error);

        updateApp(app, { runState: appdb.RSTATE_STOPPED }, callback);
    });
}

function handleRunCommand(app, callback) {
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
            debugApp(app, 'Apptask launched with error states.');
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
            if (error) console.error(error);

            debug('Apptask completed for %s', process.argv[2]);
            // https://nodejs.org/api/process.html are exit codes used by node. apps.js uses the value below
            // to check apptask crashes
            process.exit(error ? 50 : 0);
        });
    });
}

