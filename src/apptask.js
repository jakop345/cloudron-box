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
    child_process = require('child_process'),
    cloudron = require('./cloudron.js'),
    config = require('../config.js'),
    constants = require('../constants.js'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apptask'),
    dns = require('native-dns'),
    docker = require('./docker.js'),
    ejs = require('ejs'),
    execFile = child_process.execFile,
    fs = require('fs'),
    net = require('net'),
    hat = require('hat'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    superagent = require('superagent'),
    util = require('util'),
    uuid = require('node-uuid'),
    vbox = require('./vbox.js');

exports = module.exports = {
    initialize: initialize,
    startTask: startTask,
    writeNginxNakedDomainConfig: writeNginxNakedDomainConfig,

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

var NGINX_APPCONFIG_EJS = fs.readFileSync(__dirname + '/../setup/start/nginx/appconfig.ejs', { encoding: 'utf8' }),
    COLLECTD_CONFIG_EJS = fs.readFileSync(__dirname + '/collectd.config.ejs', { encoding: 'utf8' }),
    SUDO = '/usr/bin/sudo',
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh'),
    RELOAD_COLLECTD_CMD = path.join(__dirname, 'scripts/reloadcollectd.sh'),
    RMAPPDIR_CMD = path.join(__dirname, 'scripts/rmappdir.sh');

function initialize(callback) {
    database.initialize(callback);
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
    execFile(SUDO, [ RELOAD_NGINX_CMD ], { timeout: 10000 }, callback);
}

function configureNginx(app, callback) {
    getFreePort(function (error, freePort) {
        if (error) return callback(error);

        var sourceDir = path.resolve(__dirname, '..');
        var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, vhost: config.appFqdn(app.location), isAdmin: false, port: freePort, accessRestriction: app.accessRestriction });

        var nginxConfigFilename = path.join(paths.NGINX_APPCONFIG_DIR, app.id + '.conf');
        debug('writing config to ' + nginxConfigFilename);

        if (!safe.fs.writeFileSync(nginxConfigFilename, nginxConf)) {
            console.error('Error creating nginx config ' + safe.error);
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
        console.error('Error removing nginx configuration ' + safe.error);
        return callback(null);
    }

    exports._reloadNginx(callback);

    vbox.unforwardFromHostToVirtualBox(app.id + '-http');
}

function writeNginxNakedDomainConfig(app, callback) {
    assert(app === null || typeof app === 'object');
    assert(typeof callback === 'function');

    var sourceDir = path.resolve(__dirname, '..');
    var nginxConf;
    if (app === null) { // admin
        nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, vhost: config.fqdn(), isAdmin: true });
    } else {
        nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, vhost: config.fqdn(), isAdmin: false, port: app.httpPort, accessRestriction: app.accessRestriction });
    }

    var nginxNakedDomainFilename = path.join(paths.NGINX_CONFIG_DIR, 'naked_domain.conf');
    debug('writing naked domain config to ' + nginxNakedDomainFilename);

    fs.writeFile(nginxNakedDomainFilename, nginxConf, function (error) {
        if (error) return callback(error);

        exports._reloadNginx(callback);
    });
}

function configureNakedDomain(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    settings.getNakedDomain(function (error, nakedDomainAppId) {
        if (error) return callback(error);

        if (nakedDomainAppId !== app.id) return callback(null);

        debug('configureNakedDomain: writing nginx config for %s', app.id);

        writeNginxNakedDomainConfig(app, callback);
    });
}

function unconfigureNakedDomain(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    settings.getNakedDomain(function (error, nakedDomainAppId) {
        if (error) return callback(error);

        if (nakedDomainAppId !== app.id) return callback(null);

        debug('unconfigureNakedDomain: resetting to admin');

        settings.setNakedDomain(constants.ADMIN_APPID, callback);
    });
}

function downloadImage(app, callback) {
    debug('Will download app now');

    var manifest = app.manifest;

    docker.pull(manifest.dockerImage, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker'));

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug('downloadImage:', JSON.stringify(data));

            // The information here is useless because this is per layer as opposed to per image
            if (data.status) {
                debug('Progress: ' + data.status); // progressDetail { current, total }
            } else if (data.error) {
                console.error('Error detail:' + data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debug('pulled successfully');

            var image = docker.getImage(manifest.dockerImage);

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

                debug('This image exposes ports: ' + JSON.stringify(data.Config.ExposedPorts));
                return callback(null);
            });
        });
    });
}

function createContainer(app, callback) {
    var manifest = app.manifest;

    appdb.getPortBindings(app.id, function (error, portBindings) {
        if (error) return callback(error);

        var manifest = app.manifest;
        var exposedPorts = { };

        for (var e in portBindings) {
            var hostPort = portBindings[e];
            var containerPort = manifest.tcpPorts[e].containerPort || hostPort;
            exposedPorts[containerPort + '/tcp'] = { };
        }

        var env = [ ];
        for (var e in portBindings) {
            var hostPort = portBindings[e];
            env.push(e + '=' + hostPort);
        }

        env.push('CLOUDRON=1');
        env.push('ADMIN_ORIGIN' + '=' + config.adminOrigin());

        addons.getEnvironment(app.id, function (error, addonEnv) {
            if (error) return callback(new Error('Error getting addon env:', + error));

            var containerOptions = {
                name: app.id,
                Hostname: config.appFqdn(app.location),
                Tty: true,
                Image: manifest.dockerImage,
                Cmd: null,
                Volumes: { },
                VolumesFrom: '',
                Env: env.concat(addonEnv),
                ExposedPorts: exposedPorts
            };

            debug('Creating container for %s', manifest.dockerImage);

            docker.createContainer(containerOptions, function (error, container) {
                if (error) return callback(new Error('Error creating container:' + error));

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

        if (error) console.error('Error removing container', error);
        callback(error);
    });
}

function deleteImage(app, callback) {
    var docker_image = app.manifest ? app.manifest.dockerImage : '';
    var image = docker.getImage(docker_image);

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
    var appDataDir = path.join(paths.APPDATA_DIR, app.id);

    if (!safe.fs.mkdirSync(appDataDir)) {
        return callback(new Error('Error creating app data directory ' + appDataDir + ' ' + safe.error));
    }

    return callback(null);
}

function deleteVolume(app, callback) {
    execFile(SUDO, [ RMAPPDIR_CMD, 'appdata/' + app.id ], { }, function (error, stdout, stderr) {
        if (error) console.error('Error removing volume', error, stdout, stderr);
        return callback(error);
    });
}

function allocateOAuthProxyCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    if (!app.accessRestriction) return callback(null);

    var appId = 'proxy-' + app.id;
    var id = 'cid-proxy-' + uuid.v4();
    var clientSecret = hat();
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

function addCollectdProfile(app, callback) {
    var collectdConf = ejs.render(COLLECTD_CONFIG_EJS, { appId: app.id, containerId: app.containerId });
    fs.writeFile(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), collectdConf, function (error) {
        if (error) return callback(error);
        execFile(SUDO, [ RELOAD_COLLECTD_CMD ], { timeout: 10000 }, callback);
    });
}

function removeCollectdProfile(app, callback) {
    fs.unlink(path.join(paths.COLLECTD_APPCONFIG_DIR, app.id + '.conf'), function (error, stdout, stderr) {
        if (error) console.error('Error removing collectd profile', error, stdout, stderr);
        execFile(SUDO, [ RELOAD_COLLECTD_CMD ], { timeout: 10000 }, callback);
    });
}

function startContainer(app, callback) {
    appdb.getPortBindings(app.id, function (error, portBindings) {
        if (error) return callback(error);

        var manifest = app.manifest;
        var appDataDir = path.join(paths.APPDATA_DIR, app.id);

        var dockerPortBindings = { };
        dockerPortBindings[manifest.httpPort + '/tcp'] = [ { HostIp: '127.0.0.1', HostPort: app.httpPort + '' } ];

        for (var env in portBindings) {
            var hostPort = portBindings[env];
            var containerPort = manifest.tcpPorts[env].containerPort || hostPort;
            dockerPortBindings[containerPort + '/tcp'] = [ { HostIp: '0.0.0.0', HostPort: hostPort } ];
            vbox.forwardFromHostToVirtualBox(app.id + '-tcp' + containerPort, hostPort);
        }

        var startOptions = {
            Binds: [ appDataDir + ':/app/data:rw' ],
            PortBindings: dockerPortBindings,
            PublishAllPorts: false,
            Links: addons.getLinksSync(app),
            RestartPolicy: {
                "Name": "on-failure",
                "MaximumRetryCount": 100
            }
        };

        var container = docker.getContainer(app.containerId);
        debug('Starting container ' + container.id + ' with options: ' + JSON.stringify(startOptions));

        container.start(startOptions, function (error, data) {
            if (error && error.statusCode !== 304) return callback(new Error('Error starting container:' + error));

            return callback(null);
        });
    });
}

function stopContainer(app, callback) {
    var container = docker.getContainer(app.containerId);
    debug('Stopping container ' + container.id);

    var options = {
        t: 10 // wait for 10 seconds before killing it
    };

    container.stop(options, function (error) {
        if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error stopping container:' + error));

        var tcpPorts = safe.query(app, 'manifest.tcpPorts', { });
        for (var containerPort in tcpPorts) {
            vbox.unforwardFromHostToVirtualBox(app.id + '-tcp' + containerPort);
        }

        debug('Waiting for container ' + container.id);

        container.wait(function (error, data) {
            if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error waiting on container:' + error));

            debug('Container stopped with status code [%s]', data ? String(data.StatusCode) : '');

            return callback(null);
        });
    });
}

function verifyManifest(app, callback) {
    debug('Verifying manifest for :', app.id);

    var manifest = app.manifest;
    var error = apps.validateManifest(manifest);
    if (error) return callback(new Error(util.format('Manifest error: %s', error.message)));

    error = apps.checkManifestConstraints(manifest);
    if (error) return callback(error);

    if (!manifest.iconUrl) return callback(null);

    superagent
        .get(manifest.iconUrl)
        .buffer(true)
        .end(function (error, res) {
            if (error) return callback(new Error('Error downloading icon:' + error.message));

            if (!safe.fs.writeFileSync(path.join(paths.APPICONS_DIR, app.id + '.png'), res.body)) return callback(new Error('Error saving icon:' + safe.error.message));

            callback(null);
    });
}

function registerSubdomain(app, callback) {
    if (!config.token()) {
        debug('Skipping subdomain registration for development');
        return callback(null);
    }

    debug('Registering subdomain for ' + app.id + ' at ' + app.location);

    var record = { subdomain: app.location, type: 'A' };

    superagent
        .post(config.apiServerOrigin() + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .query({ token: config.token() })
        .send({ records: [ record ] })
        .end(function (error, res) {
            if (error) return callback(error);

            debug('Registered subdomain for ' + app.id + ' ' + res.status);

            if (res.status === 409) return callback(null); // already registered
            if (res.status !== 201) return callback(new Error(util.format('Subdomain Registration failed. %s %j', res.status, res.body)));

            updateApp(app, { dnsRecordId: res.body.ids[0] }, callback);
        });
}

function unregisterSubdomain(app, callback) {
    if (!config.token()) {
        debug('Skipping subdomain unregistration for development');
        return callback(null);
    }

    debug('Unregistering subdomain for ' + app.id + ' at ' + app.location);
    superagent
        .del(config.apiServerOrigin() + '/api/v1/subdomains/' + app.dnsRecordId)
        .query({ token: config.token() })
        .end(function (error, res) {
            if (error) {
                console.error('Error making request: ', error);
            } else if (res.status !== 204) {
                console.error('Error unregistering subdomain:', res.status, res.body);
            }

            updateApp(app, { dnsRecordId: null }, function (error) {
                if (error) console.error(error);
                callback(null);
            });
        });
}

function removeIcon(app, callback) {
    fs.unlink(path.join(paths.APPICONS_DIR, app.id + '.png'), function (error) {
        if (error && error.code !== 'ENOENT') console.error(error);
        callback(null);
    });
}

function waitForDnsPropagation(app, callback) {
    if (process.env.NODE_ENV === 'test') {
        debug('Skipping dns propagation check for development');
        return callback(null);
    }

    var ip = cloudron.getIp(),
        zoneName = config.zoneName(),
        fqdn = config.appFqdn(app.location);

    function retry(error) {
        console.error(error);
        setTimeout(waitForDnsPropagation.bind(null, app, callback), 5000);
    }

    debug('Checking if DNS is setup for %s to resolve to %s (zone: %s)', fqdn, ip, zoneName);

    // localhost is always known
    if (zoneName === 'localhost') return callback(null);

    dns.resolveNs(zoneName, function (error, nameservers) {
        if (error || nameservers.length === 0) return retry(new Error('Failed to get NS of ' + zoneName));

        debug('checkARecord: %s should resolve to %s by %s', fqdn, ip, nameservers[0]);

        dns.resolve4(nameservers[0], function (error, dnsIps) {
            if (error || dnsIps.length === 0) return retry(new Error('Failed to query DNS'));

            var req = dns.Request({
                question: dns.Question({ name: fqdn, type: 'A' }),
                server: { address: dnsIps[0] },
                timeout: 5000
            });

            req.on('timeout', function () { return retry(new Error('Timedout')); });

            req.on('message', function (error, message) {
                debug('checkARecord:', message.answer);

                if (error || !message.answer || message.answer.length === 0) return retry(new Error('Nothing yet'));

                if (message.answer[0].address !== ip) return retry(new Error('DNS resolved to another IP'));

                callback(null);
            });

            req.send();
        });
    });
}

// updates the app object and the database
function updateApp(app, values, callback) {
    for (var value in values) {
        app[value] = values[value];
    }

    debug(app.id + ' installationState:' + app.installationState + ' progress: ' + app.installationProgress);

    appdb.update(app.id, values, callback);
}

function install(app, callback) {
    async.series([
        // configure nginx
        configureNginx.bind(null, app),

        // register subdomain
        updateApp.bind(null, app, { installationProgress: 'Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // verify manifest
        updateApp.bind(null, app, { installationProgress: 'Verifying manifest' }),
        verifyManifest.bind(null, app),

        // create proxy OAuth credentials
        updateApp.bind(null, app, { installationProgress: 'Creating OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        // download the image
        updateApp.bind(null, app, { installationProgress: 'Downloading image' }),
        downloadImage.bind(null, app),

        // setup addons
        updateApp.bind(null, app, { installationProgress: 'Setting up addons' }),
        addons.teardownAddons.bind(null, app),
        addons.setupAddons.bind(null, app),

        // create container
        updateApp.bind(null, app, { installationProgress: 'Creating container' }),
        createContainer.bind(null, app),

        // recreate data volume
        updateApp.bind(null, app, { installationProgress: 'Creating volume' }),
        deleteVolume.bind(null, app),
        createVolume.bind(null, app),

        // add collectd profile
        updateApp.bind(null, app, { installationProgress: 'Setting up collectd profile' }),
        addCollectdProfile.bind(null, app),

        // wait until dns propagated
        updateApp.bind(null, app, { installationProgress: 'Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        // done!
        function (callback) {
            debug('App ' + app.id + ' installed');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            console.error('Error installing app:', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

function restore(app, callback) {
    var oldManifest = app.manifest; // TODO: this won't be correct all the time should we crash after download manifest

    async.series([
        // configure nginx
        updateApp.bind(null, app, { installationProgress: 'Configuring nginx' }),
        configureNginx.bind(null, app),
        configureNakedDomain.bind(null, app),

        // register subdomain
        updateApp.bind(null, app, { installationProgress: 'Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // verify manifest
        updateApp.bind(null, app, { installationProgress: 'Verify manifest' }),
        verifyManifest.bind(null, app),

        // setup oauth proxy
        updateApp.bind(null, app, { installationProgress: 'Setting up OAuth proxy credentials' }),
        removeOAuthProxyCredentials.bind(null, app),
        allocateOAuthProxyCredentials.bind(null, app),

        // download the image
        updateApp.bind(null, app, { installationProgress: 'Downloading image' }),
        downloadImage.bind(null, app),

        // setup addons
        updateApp.bind(null, app, { installationProgress: 'Setting up addons' }),
        addons.updateAddons.bind(null, app, oldManifest),

        // create container (old containers are deleted by update script)
        updateApp.bind(null, app, { installationProgress: 'Creating container' }),
        createContainer.bind(null, app),

        // add collectd profile
        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        // wait until dns propagated
        updateApp.bind(null, app, { installationProgress: 'Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        // done!
        function (callback) {
            debug('App ' + app.id + ' installed');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            console.error('Error installing app:', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }

        postInstall(app, callback);
    });
}

// TODO: optimize by checking if location actually changed
function configure(app, callback) {
    async.series([
        updateApp.bind(null, app, { installationProgress: 'Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Unregistering subdomain' }),
        unregisterSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Remove OAuth credentials' }),
        removeOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Configuring Nginx' }),
        configureNginx.bind(null, app),
        configureNakedDomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Registering subdomain' }),
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Create OAuth proxy credentials' }),
        allocateOAuthProxyCredentials.bind(null, app),

        // addons like oauth might rely on the app's fqdn
        updateApp.bind(null, app, { installationProgress: 'Setting up addons' }),
        addons.setupAddons.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Waiting for DNS propagation' }),
        exports._waitForDnsPropagation.bind(null, app),

        // done!
        function (callback) {
            debug('App ' + app.id + ' installed');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            console.error('Error reconfiguring app:', app, error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

// nginx and naked domain configuration is skipped because app.httpPort is expected to be available
// TODO: old image should probably be deleted, but what if it's used by another app instance
function update(app, callback) {
    var oldManifest = app.manifest; // TODO: this won't be correct all the time should we crash after download manifest

    debug('Updating %s to %s', app.id, safe.query(app, 'manifest.version'));

    async.series([
        updateApp.bind(null, app, { installationProgress: 'Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Verify manifest' }),
        verifyManifest.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Downloading image' }),
        downloadImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Updating addons' }),
        addons.updateAddons.bind(null, app, oldManifest),

        updateApp.bind(null, app, { installationProgress: 'Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

        // done!
        function (callback) {
            debug('App ' + app.id + ' updated');
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED, installationProgress: '' }, callback);
        }
    ], function seriesDone(error) {
        if (error) {
            console.error('Error updating app:', error);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR, installationProgress: error.message }, callback.bind(null, error));
        }
        callback(null);
    });
}

function uninstall(app, callback) {
   debug('uninstalling ' + app.id);

    // TODO: figure what happens if one of the steps fail
    async.series([
        // unset naked domain
        function (callback) {
            if (config.nakedDomain !== app.id) return callback(null);

            config.set('nakedDomain', null);
            callback(null);
        },

        updateApp.bind(null, app, { installationProgress: 'Unconfiguring Nginx' }),
        unconfigureNginx.bind(null, app),
        unconfigureNakedDomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        removeCollectdProfile.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting image' }),
        deleteImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Teardown addons' }),
        addons.teardownAddons.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting volume' }),
        deleteVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Unregistering subdomain' }),
        unregisterSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Remove OAuth credentials' }),
        removeOAuthProxyCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Cleanup manifest' }),
        removeIcon.bind(null, app),

        appdb.del.bind(null, app.id)
    ], callback);
}

function runApp(app, callback) {
    startContainer(app, function (error) {
        if (error) {
            console.error('Error starting container.', error);
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

function postInstall(app, callback) {
    if (app.runState === appdb.RSTATE_PENDING_STOP) {
        return stopApp(app, callback);
    }

    if (app.runState !== appdb.RSTATE_STOPPED) {
        debug('Resuming app with state : %s %s', app.runState, app.id);
        return runApp(app, callback);
    }

    debug('postInstall - doing nothing: %s %s', app.runState, app.id);
    return callback(null);
}

function startTask(appId, callback) {
    // determine what to do
    appdb.get(appId, function (error, app) {
        if (error) return callback(error);

        debug('ISTATE:' + app.installationState + ' RSTATE:' + app.runState);

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
            return postInstall(app, callback);
        }

        if (app.installationState === appdb.ISTATE_PENDING_INSTALL) {
            install(app, function (error) {
                if (error) return callback(error);

                runApp(app, callback);
            });
            return;
        }

        console.error('Apptask launched but nothing to do.', app);
        return callback(null);
    });
}

if (require.main === module) {
    assert(process.argv.length === 3, 'Pass the appid as argument');

    debug('Apptask for ' + process.argv[2]);

    initialize(function (error) {
        if (error) throw error;

        startTask(process.argv[2], function (error) {
            debug('Apptask completed for ' + process.argv[2], error);
            process.exit(error ? 1 : 0);
        });
    });
}

