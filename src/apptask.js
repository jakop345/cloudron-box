#!/usr/bin/env node

/* jslint node:true */

'use strict';

require('supererror')({ splatchError: true });

var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    clientdb = require('./clientdb.js'),
    cloudron = require('./cloudron.js'),
    config = require('../config.js'),
    constants = require('../constants.js'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apptask'),
    docker = require('./docker.js'),
    ejs = require('ejs'),
    fs = require('fs'),
    hat = require('hat'),
    manifestFormat = require('manifestformat'),
    net = require('net'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    shell = require('./shell.js'),
    superagent = require('superagent'),
    tokendb = require('./tokendb.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    vbox = require('./vbox.js');

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
    _allocateAccessToken: allocateAccessToken,
    _removeAccessToken: removeAccessToken,
    _verifyManifest: verifyManifest,
    _registerSubdomain: registerSubdomain,
    _unregisterSubdomain: unregisterSubdomain,
    _reloadNginx: reloadNginx,
    _waitForDnsPropagation: waitForDnsPropagation
};

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

    var prefix = app ? app.location : '(no app)';
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
        var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, vhost: config.appFqdn(app.location), port: freePort, endpoint: endpoint });

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

function downloadImage(app, callback) {
    debugApp(app, 'downloadImage %s', app.manifest.dockerImaeg);

    docker.pull(app.manifest.dockerImage, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker'));

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
                if (err) {
                    return callback(new Error('Error inspecting image:' + err.message));
                }

                if (!data || !data.Config) {
                    return callback(new Error('Missing Config in image:' + JSON.stringify(data, null, 4)));
                }

                if (!data.Config.Entrypoint && !data.Config.Cmd) {
                    return callback(new Error('Only images with entry point are allowed'));
                }

                debugApp(app, 'This image exposes ports: %j', data.Config.ExposedPorts);
                return callback(null);
            });
        });
    });
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
        env.push('ADMIN_ORIGIN' + '=' + config.adminOrigin());

        tokendb.getByIdentifier(tokendb.PREFIX_APP + app.id, function (error, results) {
            if (error || results.length === 0) return callback(new Error('No access token found: ' + error));

            env.push('CLOUDRON_TOKEN' + '=' + results[0].accessToken);

            addons.getEnvironment(app.id, function (error, addonEnv) {
                if (error) return callback(new Error('Error getting addon env: ' + error));

                var containerOptions = {
                    name: app.id,
                    Hostname: config.appFqdn(app.location),
                    Tty: true,
                    Image: app.manifest.dockerImage,
                    Cmd: null,
                    Volumes: { },
                    VolumesFrom: '',
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

        if (error) console.error('Error removing container', error);
        callback(error);
    });
}

function deleteImage(app, callback) {
    var dockerImage = app.manifest.dockerImage;
    var image = docker.getImage(dockerImage);

    var removeOptions = {
        force: true,
        noprune: false
    };

    image.remove(removeOptions, function (error) {
        if (error && error.statusCode === 404) return callback(null);
        if (error && error.statusCode === 409) return callback(null); // another container using the image

        if (error) console.error('Error removing image', error);
        callback(error);
    });
}

function createVolume(app, callback) {
    shell.sudo('createVolume', [ CREATEAPPDIR_CMD, app.id ], callback);
}

function deleteVolume(app, callback) {
    shell.sudo('deleteVolume', [ RMAPPDIR_CMD, app.id ], callback);
}

function allocateOAuthProxyCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    if (!app.accessRestriction) return callback(null);

    var appId = 'proxy-' + app.id;
    var id = 'cid-proxy-' + uuid.v4();
    var clientSecret = hat(256);
    var redirectURI = 'https://' + config.appFqdn(app.location);
    var scope = 'profile,' + app.accessRestriction;

    clientdb.add(id, appId, clientSecret, redirectURI, scope, callback);
}

function removeOAuthProxyCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    clientdb.delByAppId('proxy-' + app.id, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) {
            console.error('Error removing OAuth client id', error);
            return callback(error);
        }

        callback(null);
    });
}

function allocateAccessToken(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var token = tokendb.generateToken();
    var expiresAt = Number.MAX_SAFE_INTEGER;    // basically never expire
    var scopes = 'profile,users';               // TODO This should be put into the manifest and the user should know those
    var clientId = '';                          // meaningless for apps so far

    tokendb.add(token, tokendb.PREFIX_APP + app.id, clientId, expiresAt, scopes, callback);
}

function removeAccessToken(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    tokendb.delByIdentifier(tokendb.PREFIX_APP + app.id, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) {
            console.error('Error removing access token', error);
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
    fs.unlink(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), function (error, stdout, stderr) {
        if (error) console.error('Error removing collectd profile', error, stdout, stderr);
        shell.sudo('removeCollectdProfile', [ RELOAD_COLLECTD_CMD ], callback);
    });
}

function startContainer(app, callback) {
    appdb.getPortBindings(app.id, function (error, portBindings) {
        if (error) return callback(error);

        var manifest = app.manifest;
        var appDataDir = path.join(paths.DATA_DIR, app.id, 'data');

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

        var startOptions = {
            Binds: [ appDataDir + ':/app/data:rw' ].concat(addons.getBindsSync(app)),
            PortBindings: dockerPortBindings,
            PublishAllPorts: false,
            Links: addons.getLinksSync(app),
            RestartPolicy: {
                "Name": "always",
                "MaximumRetryCount": 0
            }
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
    if (config.LOCAL) {
        debugApp(app, 'Skipping subdomain registration for development');
        return callback(null);
    }

    debugApp(app, 'Registering subdomain');

    var record = { subdomain: app.location, type: 'A', value: cloudron.getIp() };

    superagent
        .post(config.apiServerOrigin() + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .query({ token: config.token() })
        .send({ records: [ record ] })
        .end(function (error, res) {
            if (error) return callback(error);

            debugApp(app, 'Registered subdomain status: %s', res.status);

            if (res.status === 409) return callback(null); // already registered
            if (res.status !== 201) return callback(new Error(util.format('Subdomain Registration failed. %s %j', res.status, res.body)));

            updateApp(app, { dnsRecordId: res.body.ids[0] }, callback);
        });
}

function unregisterSubdomain(app, callback) {
    if (config.LOCAL) {
        debugApp(app, 'Skipping subdomain unregistration for development');
        return callback(null);
    }

    debugApp(app, 'Unregistering subdomain');

    superagent
        .del(config.apiServerOrigin() + '/api/v1/subdomains/' + app.dnsRecordId)
        .query({ token: config.token() })
        .end(function (error, res) {
            if (error) {
                debugApp(app, 'Error making request: %s', error);
            } else if (res.status !== 204) {
                console.error('Error unregistering subdomain:', res.status, res.body);
            }

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

    superagent
        .get(config.apiServerOrigin() + '/api/v1/subdomains/' + app.dnsRecordId + '/status')
        .set('Accept', 'application/json')
        .query({ token: config.token() })
        .end(function (error, res) {
            if (error) return retry(new Error('Failed to get dns record status : ' + error.message));

            debugApp(app, 'waitForDnsPropagation: dnsRecordId:%s status:%s', app.dnsRecordId, res.status);

            if (res.status !== 200) return retry(new Error(util.format('Error getting record status: %s %j', res.status, res.body)));

            if (res.body.status !== 'done') return retry(new Error(util.format('app:%s not ready yet: %s', app.id, res.body.status)));

            callback(null);
        });
}

// updates the app object and the database
function updateApp(app, values, callback) {
    for (var value in values) {
        app[value] = values[value];
    }

    debugApp(app, 'installationState: %s progress: %s', app.installationState, app.installationProgress);

    appdb.update(app.id, values, callback);
}

function install(app, callback) {
    async.series([
        // configure nginx
        configureNginx.bind(null, app),

        // register subdomain
        updateApp.bind(null, app, { installationProgress: '0, Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // verify manifest
        updateApp.bind(null, app, { installationProgress: '10, Verifying manifest' }),
        verifyManifest.bind(null, app),
        downloadIcon.bind(null, app),

        // create proxy OAuth credentials
        updateApp.bind(null, app, { installationProgress: '20, Creating OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        // allocate access token
        updateApp.bind(null, app, { installationProgress: '30, Allocate access token' }),
        allocateAccessToken.bind(null, app),

        // download the image
        updateApp.bind(null, app, { installationProgress: '40, Downloading image' }),
        downloadImage.bind(null, app),

        // recreate data volume
        updateApp.bind(null, app, { installationProgress: '50, Creating volume' }),
        deleteVolume.bind(null, app),
        createVolume.bind(null, app),

        // setup addons
        updateApp.bind(null, app, { installationProgress: '60, Setting up addons' }),
        addons.teardownAddons.bind(null, app),
        addons.setupAddons.bind(null, app),

        // recreate container
        updateApp.bind(null, app, { installationProgress: '70, Creating container' }),
        deleteContainer.bind(null, app),
        createContainer.bind(null, app),

        // add collectd profile
        updateApp.bind(null, app, { installationProgress: '80, Setting up collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        // wait until dns propagated
        updateApp.bind(null, app, { installationProgress: '90, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'installed');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'error installing app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

function restore(app, callback) {
    var oldManifest = app.manifest; // TODO: this won't be correct all the time should we crash after download manifest

    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Stopping app and deleting container' }),
        stopApp.bind(null, app),
        deleteContainer.bind(null, app),

        // configure nginx
        updateApp.bind(null, app, { installationProgress: '10, Configuring nginx' }),
        configureNginx.bind(null, app),

        // register subdomain
        updateApp.bind(null, app, { installationProgress: '12, Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // verify manifest
        updateApp.bind(null, app, { installationProgress: '14, Verify manifest' }),
        verifyManifest.bind(null, app),
        downloadIcon.bind(null, app),

        // setup oauth proxy
        updateApp.bind(null, app, { installationProgress: '16, Setting up OAuth proxy credentials' }),
        removeOAuthProxyCredentials.bind(null, app),
        allocateOAuthProxyCredentials.bind(null, app),

        // allocate access token
        updateApp.bind(null, app, { installationProgress: '20, Allocate access token' }),
        removeAccessToken.bind(null, app),
        allocateAccessToken.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '25, Downloading last backup' }),
        deleteVolume.bind(null, app),
        createVolume.bind(null, app),

        // download the image
        updateApp.bind(null, app, { installationProgress: '40, Downloading image' }),
        downloadImage.bind(null, app),

        // restore app and addons
        updateApp.bind(null, app, { installationProgress: '60, Restoring app and addons' }),
        cloudron.restoreApp.bind(null, app),

        // recreate container
        updateApp.bind(null, app, { installationProgress: '70, Creating container' }),
        deleteContainer.bind(null, app),
        createContainer.bind(null, app),

        // add collectd profile
        updateApp.bind(null, app, { installationProgress: '80, Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        // wait until dns propagated
        updateApp.bind(null, app, { installationProgress: '90, Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'restored');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            debugApp(app, 'Error installing app: %s', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }

        callback(null);
    });
}

// TODO: optimize by checking if location actually changed
function configure(app, callback) {
    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '5, Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '10, Unregistering subdomain' }),
        // unregisterSubdomain.bind(null, app), // TODO: we don't have the old subdomain

        updateApp.bind(null, app, { installationProgress: '15, Remove OAuth credentials' }),
        removeOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Remove access token' }),
        removeAccessToken.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '25, Configuring Nginx' }),
        configureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Registering subdomain' }),
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '35, Create OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        // allocate access token
        updateApp.bind(null, app, { installationProgress: '40, Allocate access token' }),
        allocateAccessToken.bind(null, app),

        // addons like oauth might rely on the app's fqdn
        updateApp.bind(null, app, { installationProgress: '50, Setting up addons' }),
        addons.setupAddons.bind(null, app),

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
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
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
// TODO: old image should probably be deleted, but what if it's used by another app instance
function update(app, callback) {
    var oldManifest = app.manifest; // TODO: this won't be correct all the time should we crash after download manifest

    debugApp(app, 'Updating to %s', safe.query(app, 'manifest.version'));

    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '10, Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Backup and uploading app data' }),
        cloudron.backupApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '35, Verify manifest' }),
        verifyManifest.bind(null, app),
        downloadIcon.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '45, Downloading image' }),
        downloadImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '70, Updating addons' }),
        addons.updateAddons.bind(null, app, oldManifest),

        updateApp.bind(null, app, { installationProgress: '80, Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        // done!
        function (callback) {
            debugApp(app, 'updated');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
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

    // TODO: figure what happens if one of the steps fail
    async.series([
        updateApp.bind(null, app, { installationProgress: '0, Unconfiguring Nginx' }),
        unconfigureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '10, Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '20, Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '30, Remove collectd profile' }),
        removeCollectdProfile.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '40, Deleting image' }),
        deleteImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '50, Teardown addons' }),
        addons.teardownAddons.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '60, Deleting volume' }),
        deleteVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '70, Unregistering subdomain' }),
        unregisterSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '80, Remove access token' }),
        removeAccessToken.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '85, Remove OAuth credentials' }),
        removeOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: '90, Cleanup manifest' }),
        removeIcon.bind(null, app),

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

        if (app.installationState === appdb.ISTATE_PENDING_UNINSTALL) {
            return uninstall(app, callback);
        }

        if (app.installationState === appdb.ISTATE_PENDING_CONFIGURE) {
            return configure(app, callback);
        }

        if (app.installationState === appdb.ISTATE_PENDING_UPDATE) {
            return update(app, callback);
        }

        if (app.installationState === appdb.ISTATE_PENDING_RESTORE) {
            return restore(app, callback);
        }

        if (app.installationState === appdb.ISTATE_INSTALLED) {
            return handleRunCommand(app, callback);
        }

        if (app.installationState === appdb.ISTATE_PENDING_INSTALL) {
            return install(app, callback);
        }

        debugApp(app, 'Apptask launched but nothing to do.');
        return callback(null);
    });
}

if (require.main === module) {
    assert(process.argv.length === 3, 'Pass the appid as argument');

    debug('Apptask for %s', process.argv[2]);

    initialize(function (error) {
        if (error) throw error;

        startTask(process.argv[2], function (error) {
            debug('Apptask completed for %s %s', process.argv[2], error);
            process.exit(error ? 1 : 0);
        });
    });
}

