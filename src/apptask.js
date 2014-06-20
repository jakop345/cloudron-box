#!/usr/bin/env node

/* jslint node:true */

'use strict';

var assert = require('assert'),
    Docker = require('dockerode'),
    superagent = require('superagent'),
    async = require('async'),
    os = require('os'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    Writable = require('stream').Writable,
    debug = require('debug')('box:apptask'),
    fs = require('fs'),
    child_process = require('child_process'),
    path = require('path'),
    net = require('net'),
    rimraf = require('rimraf'),
    config = require('../config.js'),
    database = require('./database.js');

exports = module.exports = {
    initialize: initialize,
    refresh: refresh
};

// FIXME: For some reason our selfhost.io certificate doesn't work with
// superagent and fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE
// Important to remove this before we release
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

var appServerUrl = config.appServerUrl, docker = null, appDataRoot = config.appDataRoot,
    refreshing = false, pendingRefresh = false,
    nginxAppConfigDir = config.nginxAppConfigDir,
    HOSTNAME = process.env.HOSTNAME || os.hostname();

var appHealth = (function () {
    var data = { };
    var MAX_HEALTH = 5;

    return {
        get: function (appId) {
            return data[appId] || 0;
        },

        register: function (appId) {
            assert(typeof appId === 'string');

            data[appId] = MAX_HEALTH;
        },
        unregister: function (appId) {
            assert(typeof appId === 'string');

            delete data[appId];
        },
        increment: function (appId) {
            assert(typeof appId === 'string');
            assert(data.hasOwnProperty(appId));

            data[appId] = Math.min(data[appId] + 1, MAX_HEALTH);
            return data[appId];
        },
        decrement: function (appId) {
            assert(typeof appId === 'string');
            assert(data.hasOwnProperty(appId));

            return --data[appId];
        }
    };
})();

function initialize() {
    if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 2375 });
    }

    database.initialize(config, function (error) {
        assert(!error);

        appdb.getAll(function (error, apps) {
            if (error) return;
            apps.forEach(function (app) { appHealth.register(app.id); });
        });

        setInterval(refresh, 6000);
    });
}

function getFreePort(callback) {
    var server = net.createServer();
    server.listen(0, function () {
        var port = server.address().port;
        server.close(function () {
            return callback(null, port);
        });
    });
}

function forwardFromHostToVirtualBox(rulename, port) {
    if (os.platform() === 'darwin') {
        debug('Setting up VirtualBox port forwarding for '+ rulename + ' at ' + port);
        child_process.exec(
            'VBoxManage controlvm boot2docker-vm natpf1 delete ' + rulename + ';'
            + 'VBoxManage controlvm boot2docker-vm natpf1 ' + rulename + ',tcp,127.0.0.1,' + port + ',,' + port, NOOP_CALLBACK);
    }
}

function configureNginx(app, freePort, callback) {
    var NGINX_APPCONFIG_TEMPLATE =
        "server {\n"
        + "    listen 443;\n"
        + "    server_name #APP_VHOST_NAME#;\n"
        + "    ssl on;\n"
        + "    ssl_certificate cert/cert.pem;\n"
        + "    ssl_certificate_key cert/key.pem;\n"
        + "    ssl_session_timeout 5m;\n"
        + "    ssl_protocols  SSLv2 SSLv3 TLSv1;\n"
        + "    ssl_ciphers  HIGH:!aNULL:!MD5;\n"
        + "    ssl_prefer_server_ciphers   on;\n"
        + "    proxy_http_version 1.1;\n"
        + "    # proxy_intercept_errors on;\n"
        + "    # error_page 500 502 503 504 = @install_progress;\n"
        + "    location / {\n"
        + "        proxy_pass http://127.0.0.1:#PORT#;\n"
        + "    }\n"
        + "}\n";

    var nginxConf =
        NGINX_APPCONFIG_TEMPLATE.replace('#APP_VHOST_NAME#', app.location + '.' + HOSTNAME)
        .replace('#PORT#', freePort);

    var nginxConfigFilename = path.join(nginxAppConfigDir, app.location + '.conf'); // TODO: check if app.location is safe
    debug('writing config to ' + nginxConfigFilename);

    fs.writeFile(nginxConfigFilename, nginxConf, function (error) {
        if (error) {
            debug('Error writing nginx config : ' + error);
            appdb.update(app.id, { statusCode: appdb.STATUS_NGINX_ERROR, statusMessage: error }, NOOP_CALLBACK);
            return callback(null);
        }

        child_process.exec("supervisorctl -c supervisor/supervisord.conf restart nginx", { timeout: 10000 }, function (error, stdout, stderr) {
            if (error) {
                debug('Error configuring nginx. Reload nginx manually for now', error);
                appdb.update(app.id, { statusCode: appdb.STATUS_NGINX_ERROR, statusMessage: error }, NOOP_CALLBACK);
                return callback(null);
            }

            appdb.update(app.id, { statusCode: appdb.STATUS_NGINX_CONFIGURED, statusMessage: '', httpPort: freePort }, callback);
            // missing 'return' is intentional
        });

        forwardFromHostToVirtualBox(app.id + '-http', freePort);
    });
}

function downloadImage(app, callback) {
    debug('Will download app now');

    appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADING_IMAGE, statusMessage: '' }, NOOP_CALLBACK);

    var manifest = safe.JSON.parse(app.manifestJson);
    if (manifest === null) {
        debug('Error parsing manifest: ' + safe.error);
        appdb.update(app.id, { statusCode: appdb.STATUS_MANIFEST_ERROR, statusMessage: 'Parse error:' + safe.error }, NOOP_CALLBACK);
        return callback(null);
    }
    if (!manifest.health_check_url || !manifest.docker_image || !manifest.http_port) {
        debug('Manifest missing mandatory parameters');
        appdb.update(app.id, { statusCode: appdb.STATUS_MANIFEST_ERROR, statusMessage: 'Missing parameters' }, NOOP_CALLBACK);
        return callback(null);
    }

    docker.pull(manifest.docker_image, function (err, stream) {
        if (err) {
            debug('Error connecting to docker', err);
            appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOAD_ERROR, statusMessage: 'Error connecting to docker' }, NOOP_CALLBACK);
            return callback(err);
        }

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug(JSON.stringify(data));
            if (data.status) {
                debug('Progress: ' + data.status); // progressDetail { current, total }
                appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADING_IMAGE, statusMessage: data.status }, NOOP_CALLBACK);
            } else if (data.error) {
                debug('Error detail:' + data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debug('pulled successfully');

            var image = docker.getImage(manifest.docker_image);

            image.inspect(function (err, data) {
                if (err || !data || !data.Config) {
                    debug('Error inspecting image');
                    appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error inspecting image' }, NOOP_CALLBACK);
                    return callback(err);
                }
                if (!data.Config.Entrypoint && !data.Config.Cmd) {
                    debug('Only images with entry point are allowed');
                    appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'No entrypoint in image' }, NOOP_CALLBACK);
                    return callback(err);
                }

                debug('This image exposes ports: ' + JSON.stringify(data.Config.ExposedPorts));
                appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADED_IMAGE, statusMessage: '' }, callback);
            });
        });
    });
}

function createContainer(app, portConfigs, callback) {
    var manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()

    appdb.update(app.id, { statusCode: appdb.STATUS_CREATING_CONTAINER, statusMessage: '' }, NOOP_CALLBACK);

    var env = [ ];
    if (typeof manifest.tcp_ports === 'object') {
        portConfigs.forEach(function (portConfig) {
            if (!(portConfig.containerPort in manifest.tcp_ports)) return;
            env.push(manifest.tcp_ports[portConfig.containerPort].environment_variable + '=' + portConfig.hostPort);
        });
    }

    var containerOptions = {
        Hostname: app.location + '.' + HOSTNAME,
        Tty: true,
        Image: manifest.docker_image,
        Cmd: null,
        Volumes: { },
        VolumesFrom: '',
        Env: env
    };

    debug('Creating container for ' + manifest.docker_image);

    docker.createContainer(containerOptions, function (err, container) {
        if (err) {
            debug('Error creating container');
            appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error creating container' }, NOOP_CALLBACK);
            return callback(err);
        }

        appdb.update(app.id, { containerId: container.id, statusCode: appdb.STATUS_CREATED_CONTAINER, statusMessage: '' }, callback);
    });
}

function createVolume(app, callback) {
    var appDataDir = path.join(appDataRoot, app.id); // TODO: check if app.id is safe path

    appdb.update(app.id, { statusCode: appdb.STATUS_CREATING_VOLUME, statusMessage: '' }, NOOP_CALLBACK);

    if (!safe.fs.mkdirSync(appDataDir)) {
        debug('Error creating app data directory ' + appDataDir + ' ' + safe.error);
        appdb.update(app.id, { statusCode: appdb.STATUS_VOLUME_ERROR, statusMessage: 'Error creating data directory' }, NOOP_CALLBACK);
        return callback(safe.error);
    }

    appdb.update(app.id, { statusCode: appdb.STATUS_CREATED_VOLUME, statusMessage: '' }, callback);
}

function startContainer(app, portConfigs, callback) {
    var manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()
    var appDataDir = path.join(appDataRoot, app.id); // TODO: check if app.id is safe path

    appdb.update(app.id, { statusCode: appdb.STATUS_STARTING_CONTAINER, statusMessage: '' }, NOOP_CALLBACK);

    var portBindings = { };
    portBindings[manifest.http_port + '/tcp'] = [ { HostPort: app.httpPort + '' } ];
    if (typeof manifest.tcp_ports === 'object') {
        portConfigs.forEach(function (portConfig) {
            if (!(portConfig.containerPort in manifest.tcp_ports)) return;
            portBindings[portConfig.containerPort + '/tcp'] = [ { HostPort: portConfig.hostPort + '' } ];
            forwardFromHostToVirtualBox(app.id + '-tcp' + portConfig.containerPort, portConfig.hostPort);
        });
    }

    var startOptions = {
        Binds: [ appDataDir + ':/app/data:rw' ],
        PortBindings: portBindings,
        PublishAllPorts: false
    };

    var container = docker.getContainer(app.containerId);
    debug('Starting container ' + container.id + ' with options: ' + JSON.stringify(startOptions));

    container.start(startOptions, function (err, data) {
        if (err) {
            debug('Error starting container', err);
            appdb.update(app.id, { statusCode: appdb.STATUS_CONTAINER_ERROR, statusMessage: 'Error starting container' }, NOOP_CALLBACK);
            return callback(err);
        }

        appHealth.register(app.id);

        appdb.update(app.id, { statusCode: appdb.STATUS_STARTED_CONTAINER, statusMessage: '' }, callback);
    });
}

function downloadManifest(app, callback) {
    debug('Downloading manifest for :', app.id);

    appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADING_MANIFEST, statusMessage: '' }, NOOP_CALLBACK);

    superagent
        .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
        .set('Accept', 'application/json')
        .end(function (error, res) {
            if (error) {
                debug('Error making request: ' + error.message);
                appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOAD_ERROR, statusMessage: error.message }, NOOP_CALLBACK);
                return callback(null);
            }
            if (res.status !== 200) {
                debug('Error downloading manifest:' + res.body.status + ' ' + res.body.message);
                appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOAD_ERROR, statusMessage: res.body.status + ' ' + res.body.message }, NOOP_CALLBACK);
                return callback(null);
            }

            debug('Downloaded application manifest: ' + res.text);
            appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADED_MANIFEST, statusMessage: '', manifestJson: res.text }, callback);
        });
}

function uninstall(app, callback) {
    var container = docker.getContainer(app.containerId);

    var removeOptions = {
        force: true, // kill container if it's running
        v: true // removes volumes associated with the container
    };

    console.log('uninstalling ' + app.id);

    var nginxConfigFilename = path.join(nginxAppConfigDir, app.location + '.conf'); // TODO: check if app.location is safe
    if (!safe.fs.unlinkSync(nginxConfigFilename)) {
        debug('Error removing nginx configuration ' + safe.error);
    }

    container.remove(removeOptions, function (error) {
        if (error) debug('Error removing container:' + JSON.stringify(error)); // TODO: now what?

        child_process.exec('sudo ' + __dirname + '/rmappdir.sh ' + [ app.id ], function (error, stdout, stderr) {
            if (error) debug('Error removing app directory:' + app.id); // TODO: now what?

            appHealth.unregister(app.id);

            appdb.del(app.id, callback);
        });
    });
}

// # TODO should probably poll from the outside network instead of the docker network?
function checkAppHealth(app, callback) {
    var container = docker.getContainer(app.containerId),
        manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()

    container.inspect(function (err, data) {
        if (err || !data || !data.State) {
            debug('Error inspecting container');
            appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error inspecting image' }, NOOP_CALLBACK);
            return callback(err);
        }

        if (data.State.Running !== true) {
            appdb.update(app.id, { statusCode: appdb.STATUS_EXITED, statusMessage: 'Not running' }, callback);
            return;
        }

        var healthCheckUrl = 'http://127.0.0.1:' + app.httpPort + manifest.health_check_url;
        superagent
            .get(healthCheckUrl)
            .end(function (error, res) {

            if (error || res.status !== 200) {
                if (appHealth.decrement(app.id) < 0) {
                    debug('Marking application as dead: ' + app.id);
                    appdb.update(app.id, { statusCode: appdb.STATUS_DEAD, statusMessage: 'Health check failed' }, NOOP_CALLBACK);
                }
                debug('unhealthy app:' + app.id + ' ' + appHealth.get(app.id));
                callback(null);
            } else {
                debug('healthy app:' + app.id + ' ' + appHealth.get(app.id));
                appHealth.increment(app.id);
                appdb.update(app.id, { statusCode: appdb.STATUS_RUNNING, statusMessage: healthCheckUrl }, NOOP_CALLBACK);
                callback(null);
            }
        });
    });
}

function registerSubdomain(app, callback) {
    appdb.update(app.id, { statusCode: appdb.STATUS_REGISTERING_SUBDOMAIN, statusMessage: '' }, NOOP_CALLBACK);

    superagent
        .post(appServerUrl + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .send({ subdomain: app.location, domain: HOSTNAME }) // TODO: the HOSTNAME should not be required
        .end(function (error, res) {
            if (error) {
                debug('Error making request: ' + error.message);
                appdb.update(app.id, { statusCode: appdb.STATUS_SUBDOMAIN_ERROR, statusMessage: error.message }, NOOP_CALLBACK);
                return callback(null);
            }
            if (res.status !== 200) {
                debug('Error registering subdomain:' + res.body.status + ' ' + res.body.message);
                appdb.update(app.id, { statusCode: appdb.STATUS_SUBDOMAIN_ERROR, statusMessage: res.body.status + ' ' + res.body.message }, NOOP_CALLBACK);
                return callback(null);
            }

            appdb.update(app.id, { statusCode: appdb.STATUS_REGISTERED_SUBDOMAIN, statusMessage: '' }, callback);
        });
}

function refresh() {
    if (refreshing) {
        debug('Already refreshing, marked as pending');
        pendingRefresh = true;
        return;
    }

    refreshing = true;

    debug('Refreshing');

    appdb.getAll(function (error, apps) {
        if (error) {
            debug('Error reading apps table ' + error);
            return;
        }

        async.eachSeries(apps, function iterator(app, callback) {
            switch (app.statusCode) {
            case appdb.STATUS_PENDING_INSTALL:
            case appdb.STATUS_NGINX_ERROR:
                getFreePort(function (error, freePort) {
                    if (error) return callback(null);
                    configureNginx(app, freePort, callback);
                });
                break;

            case appdb.STATUS_NGINX_CONFIGURED:
            case appdb.STATUS_MANIFEST_ERROR:
            case appdb.STATUS_DOWNLOAD_ERROR:
            case appdb.STATUS_DOWNLOADING_MANIFEST:
                downloadManifest(app, callback);
                break;

            case appdb.STATUS_DOWNLOADING_IMAGE:
            case appdb.STATUS_DOWNLOADED_MANIFEST:
                downloadImage(app, callback);
                break;

            case appdb.STATUS_DOWNLOADED_IMAGE:
            case appdb.STATUS_CREATING_CONTAINER:
            case appdb.STATUS_EXITED:
                appdb.getPortBindings(app.id, function (error, portBindings) {
                    if (error) portBindings = [ ]; // TODO: this is probably not good
                    createContainer(app, portBindings, callback);
                });
                break;

            case appdb.STATUS_CREATED_CONTAINER:
            case appdb.STATUS_CREATING_VOLUME:
                createVolume(app, callback);
                break;

            case appdb.STATUS_CREATED_VOLUME:
            case appdb.STATUS_STARTING_CONTAINER:
                appdb.getPortBindings(app.id, function (error, portBindings) {
                    if (error) portBindings = [ ]; // TODO: this is probably not good
                    startContainer(app, portBindings, callback);
                });
                break;

            case appdb.STATUS_PENDING_UNINSTALL:
                uninstall(app, callback);
                break;

            case appdb.STATUS_STARTED_CONTAINER:
            case appdb.STATUS_REGISTERING_SUBDOMAIN:
                registerSubdomain(app, callback);
                break;

            case appdb.STATUS_REGISTERED_SUBDOMAIN:
            case appdb.STATUS_RUNNING:
                checkAppHealth(app, callback);
                break;

            // do nothing: let user retry again
            case appdb.STATUS_SUBDOMAIN_ERROR: // TODO: register with threshold
            case appdb.STATUS_CONTAINER_ERROR:
            case appdb.STATUS_VOLUME_ERROR:
            case appdb.STATUS_IMAGE_ERROR:
            case appdb.STATUS_DEAD: // TODO: restart DEAD apps with threshold?
                callback(null);
                break;
            }
        }, function callback(err) {
            refreshing = false;
            if (pendingRefresh) process.nextTick(refresh);
            pendingRefresh = false;
        });

    });
}

if (require.main === module) {
    initialize();

    process.on('message', function (message) {
        if (message.cmd === 'refresh') refresh();
    });
}

