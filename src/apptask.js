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
    database = require('./database.js'),
    HttpError = require('./httperror.js');

exports = module.exports = {
    initialize: initialize,
    run: run
};

// FIXME: For some reason our selfhost.io certificate doesn't work with
// superagent and fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE
// Important to remove this before we release
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

var appServerUrl = config.appServerUrl,
    docker = null,
    appDataRoot = config.appDataRoot,
    nginxAppConfigDir = config.nginxAppConfigDir,
    HOSTNAME = process.env.HOSTNAME || os.hostname();

function initialize() {
    if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 2375 });
    }

    database.initialize(config, function (error) {
        if (error) throw error;
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
            + 'VBoxManage controlvm boot2docker-vm natpf1 ' + rulename + ',tcp,127.0.0.1,' + port + ',,' + port);
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
        + "    proxy_intercept_errors on;\n"
        + "    error_page 500 502 503 504 =302 @appstatus;\n"
        + "    location @appstatus {\n"
        + "        root ../webadmin;\n"
        + "        try_files /appstatus.html =404;\n"
        + "    }\n"
        + "    location / {\n"
        + "        proxy_pass http://127.0.0.1:#PORT#;\n"
        + "    }\n"
        + "}\n";

    var nginxConf =
        NGINX_APPCONFIG_TEMPLATE.replace(/#APP_VHOST_NAME#/g, app.location + '.' + HOSTNAME)
            .replace(/#PORT#/g, freePort)
            .replace(/#APPID#/g, app.id);

    var nginxConfigFilename = path.join(nginxAppConfigDir, app.location + '.conf'); // TODO: check if app.location is safe
    debug('writing config to ' + nginxConfigFilename);

    fs.writeFile(nginxConfigFilename, nginxConf, function (error) {
        if (error) return callback(error);

        child_process.exec("supervisorctl -c supervisor/supervisord.conf restart nginx", { timeout: 10000 }, function (error, stdout, stderr) {
            if (error) return callback(error);

            return callback(null);
            // missing 'return' is intentional
        });

        forwardFromHostToVirtualBox(app.id + '-http', freePort);
    });
}

function downloadImage(app, callback) {
    debug('Will download app now');

    var manifest = safe.JSON.parse(app.manifestJson);
    if (manifest === null) return callback(new Error('Parse error:' + safe.error));

    if (!manifest.health_check_url || !manifest.docker_image || !manifest.http_port) {
        return callback(new Error('Manifest missing mandatory parameters'));
    }

    docker.pull(manifest.docker_image, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker'));

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug(JSON.stringify(data));

            // The information here is useless because this is per layer as opposed to per image
            if (data.status) {
                debug('Progress: ' + data.status); // progressDetail { current, total }
            } else if (data.error) {
                debug('Error detail:' + data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debug('pulled successfully');

            var image = docker.getImage(manifest.docker_image);

            image.inspect(function (err, data) {
                if (err || !data || !data.Config) {
                    return callback(new Error('Error inspecting image'));
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

function createContainer(app, portConfigs, callback) {
    var manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadImage()

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

    docker.createContainer(containerOptions, function (error, container) {
        if (error) return callback(new Error('Error creating container:' + error));

        return callback(null, container.id);
    });
}

function createVolume(app, callback) {
    var appDataDir = path.join(appDataRoot, app.id); // TODO: check if app.id is safe path

    if (!safe.fs.mkdirSync(appDataDir)) {
        return callback(new Error('Error creating app data directory ' + appDataDir + ' ' + safe.error));
    }

    return callback(null);
}

function startContainer(app, portConfigs, callback) {
    var manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()
    var appDataDir = path.join(appDataRoot, app.id); // TODO: check if app.id is safe path

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

    container.start(startOptions, function (error, data) {
        if (error) return callback(new Error('Error starting container:' + error));

        return callback(null);
    });
}

function downloadManifest(app, callback) {
    debug('Downloading manifest for :', app.id);

    superagent
        .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
        .set('Accept', 'application/json')
        .end(function (error, res) {
            if (error) return callback(error);

            if (res.status !== 200) return callback(new Error('Error downloading manifest.' + res.body.status + ' ' + res.body.message));

            debug('Downloaded application manifest: ' + res.text);
            return callback(null, res.text);
        });
}

function uninstall(app, callback) {
    var container = docker.getContainer(app.containerId);

    var removeOptions = {
        force: true, // kill container if it's running
        v: true // removes volumes associated with the container
    };

    debug('uninstalling ' + app.id);

    var nginxConfigFilename = path.join(nginxAppConfigDir, app.location + '.conf'); // TODO: check if app.location is safe
    if (!safe.fs.unlinkSync(nginxConfigFilename)) {
        debug('Error removing nginx configuration ' + safe.error);
    }

    container.remove(removeOptions, function (error) {
        if (error) debug('Error removing container:' + JSON.stringify(error)); // TODO: now what?

        child_process.exec('sudo ' + __dirname + '/rmappdir.sh ' + [ app.id ], function (error, stdout, stderr) {
            if (error) debug('Error removing app directory:' + app.id); // TODO: now what?

            unregisterSubdomain(app, function (error) {
                if (error) return callback(error);

                appdb.del(app.id, callback);
            });
        });
    });
}

function registerSubdomain(app, callback) {
    debug('Registering subdomain for ' + app.id + ' at ' + app.location + '.' + HOSTNAME);

    superagent
        .post(appServerUrl + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .send({ subdomain: app.location, domain: HOSTNAME }) // TODO: the HOSTNAME should not be required
        .end(function (error, res) {
            if (error) return callback(error);

            if (res.status !== 200) return callback(new Error('Subdomain Registration failed.' + res.body.status + ' ' + res.body.message));

            debug('Registered subdomain for ' + app.id);

            return callback(null);
        });
}

function unregisterSubdomain(app, callback) {
    debug('Unregistering subdomain for ' + app.id + ' at ' + app.location + '.' + HOSTNAME);
    superagent
        .del(appServerUrl + '/api/v1/subdomain/' + app.location)
        .end(function (error, res) {
            if (error) {
                debug('Error making request: ' + error.message);
            }

            if (res.status !== 200) {
                debug('Error unregistering subdomain:' + res.body.status + ' ' + res.body.message);
            }

            callback(null);
        });
}

// callback is called with error when something fatal happenned (and not when some error state is reached)
function processAppState(app, callback) {

    // updates the app object and the database
    function updateApp(app, values, callback) {
        for (var value in values) {
            app[value] = values[value];
        }

        debug(app.id + ' code:' + app.installationState);

        appdb.update(app.id, values, callback);
    }

    switch (app.installationState) {
    case appdb.STATUS_PENDING_INSTALL:
    case appdb.STATUS_NGINX_ERROR:
        getFreePort(function (error, freePort) {
            if (error) return callback(error);
            configureNginx(app, freePort, function (error) {
                if (error) {
                    debug('Error configuring nginx: ' + error);
                    return updateApp(app, { installationState: appdb.STATUS_NGINX_ERROR }, callback);
                }

                updateApp(app, { installationState: appdb.STATUS_NGINX_CONFIGURED, httpPort: freePort }, callback);
            });
        });
        break;

    case appdb.STATUS_NGINX_CONFIGURED:
    case appdb.STATUS_REGISTERING_SUBDOMAIN:
    case appdb.STATUS_SUBDOMAIN_ERROR:
        updateApp(app, { installationState: appdb.STATUS_REGISTERING_SUBDOMAIN }, function (error) {
            if (error) return callback(error);

            registerSubdomain(app, function (error) {
                if (error) {
                    debug('Error registering subdomain: ' + error);
                    return updateApp(app, { installationState: appdb.STATUS_SUBDOMAIN_ERROR }, callback);
                }

                updateApp(app, { installationState: appdb.STATUS_REGISTERED_SUBDOMAIN }, callback);
            });
        });
        break;

    case appdb.STATUS_REGISTERED_SUBDOMAIN:
    case appdb.STATUS_MANIFEST_ERROR:
    case appdb.STATUS_IMAGE_ERROR:
    case appdb.STATUS_DOWNLOAD_ERROR:
    case appdb.STATUS_DOWNLOADING_MANIFEST:
        updateApp(app, { installationState: appdb.STATUS_DOWNLOADING_MANIFEST }, function (error) {
            if (error) return callback(error);

            downloadManifest(app, function (error, manifestJson) {
                if (error) {
                    debug('Error downloading manifest:' + error);
                    return updateApp(app, { installationState: appdb.STATUS_MANIFEST_ERROR }, callback);
                }

                updateApp(app, { installationState: appdb.STATUS_DOWNLOADED_MANIFEST, manifestJson: manifestJson }, callback);
            });
        });
        break;

    case appdb.STATUS_DOWNLOADING_IMAGE:
    case appdb.STATUS_DOWNLOADED_MANIFEST:
        updateApp(app, { installationState: appdb.STATUS_DOWNLOADING_IMAGE }, function (error) {
            if (error) return callback(error);

            downloadImage(app, function (error) {
                if (error) {
                    debug('Error downloading image:' + error);
                    return updateApp(app, { installationState: appdb.STATUS_MANIFEST_ERROR}, callback);
                }

                updateApp(app, { installationState: appdb.STATUS_DOWNLOADED_IMAGE }, callback);
            });
        });
        break;

    case appdb.STATUS_DOWNLOADED_IMAGE:
    case appdb.STATUS_CREATING_CONTAINER:
        appdb.getPortBindings(app.id, function (error, portBindings) {
            if (error) return callback(error);

            updateApp(app, { installationState: appdb.STATUS_CREATING_CONTAINER }, function (error) {
                if (error) return callback(error);

                createContainer(app, portBindings, function (error, containerId) {
                    if (error) {
                        debug('Error creating container:' + error);
                        return updateApp(app, { installationState: appdb.STATUS_CONTAINER_ERROR }, callback);
                    }

                    updateApp(app, { containerId: containerId, installationState: appdb.STATUS_CREATED_CONTAINER }, callback);
                });
            });
        });
        break;

    case appdb.STATUS_CREATED_CONTAINER:
    case appdb.STATUS_CREATING_VOLUME:
    case appdb.STATUS_VOLUME_ERROR:
        updateApp(app, { installationState: appdb.STATUS_CREATING_VOLUME }, function (error) {
            if (error) return callback(error);

            createVolume(app, function (error) {
                if (error) {
                    debug('Error creating volume: ' + error);
                    return updateApp(app, { installationState: appdb.STATUS_VOLUME_ERROR }, callback);
                }

                updateApp(app, { installationState: appdb.STATUS_CREATED_VOLUME }, callback);
            });
        });
        break;

    case appdb.STATUS_EXITED:
    case appdb.STATUS_CREATED_VOLUME:
    case appdb.STATUS_STARTING_CONTAINER:
    case appdb.STATUS_CONTAINER_ERROR:
        appdb.getPortBindings(app.id, function (error, portBindings) {
            if (error) return callback(error);

            updateApp(app, { installationState: appdb.STATUS_STARTING_CONTAINER }, function (error) {
                if (error) return callback(error);

                startContainer(app, portBindings, function (error) {
                    if (error) {
                        debug('Error creating container:' + error);
                        return updateApp(app, { installationState: appdb.STATUS_CONTAINER_ERROR }, callback);
                    }

                    updateApp(app, { installationState: appdb.STATUS_STARTED_CONTAINER }, callback);
                });
            });
        });
        break;

    case appdb.STATUS_STARTED_CONTAINER:
        updateApp(app, { installationState: appdb.STATUS_RUNNING }, callback);
        break;

    case appdb.STATUS_PENDING_UNINSTALL:
        uninstall(app, function (error) {
            if (error) return callback(error);

            app.installationState = appdb.STATUS_UNINSTALLED;
            callback(null);
        });
        break;

    case appdb.STATUS_RUNNING:
    case appdb.STATUS_NOT_RESPONDING:
    case appdb.STATUS_EXITED:
        assert(true, 'Should not reach this state: ' + app.installationState);
        break;
    }
}

function processApp(app, callback) {
    // keep processing this app until we hit an error or running/dead
    processAppState(app, function (error) {
        if (error) return callback(error); // fatal error (not install error)

        if (app.installationState === appdb.STATUS_UNINSTALLED) {
            debug('app uninstalled, stopping');
            return callback(null);
        }

        if (app.installationState.indexOf('_error', app.installationState.length - 6) !== -1) {
            debug('app is in error state, stopping');
            return callback(null);
        }

        // move on
        if (app.installationState === appdb.STATUS_RUNNING || app.installationState === appdb.STATUS_NOT_RESPONDING || app.installationState === appdb.STATUS_EXITED) {
            debug('app installed, stopping');
            return callback(null);
        }

        processApp(app, callback);
    });
}

function run(appId, callback) {
    appdb.get(appId, function (error, app) {
        if (error) return callback(error);
        processApp(app, callback);
    });
}

if (require.main === module) {
    assert(process.argv.length === 3, 'Pass the appid as argument');

    debug('Apptask for ' + process.argv[2]);

    initialize();

    run(process.argv[2], function (error) {
        debug('Apptask completed for ' + process.argv[2] + ' ' + error);
        process.exit(error ? 1 : 0);
    });
}

