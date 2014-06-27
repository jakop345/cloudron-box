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

var FATAL_CALLBACK = function (error) {
    if (!error) return;
    console.error(error);
    process.exit(2);
};

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
            + 'VBoxManage controlvm boot2docker-vm natpf1 ' + rulename + ',tcp,127.0.0.1,' + port + ',,' + port, FATAL_CALLBACK);
    }
}

function updateApp(app, values, callback) {
    for (var value in values) {
        app[value] = values[value];
    }

    appdb.update(app.id, values, callback);
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
        if (error) {
            debug('Error writing nginx config : ' + error);
            updateApp(app, { statusCode: appdb.STATUS_NGINX_ERROR, statusMessage: error }, FATAL_CALLBACK);
            return callback(null);
        }

        child_process.exec("supervisorctl -c supervisor/supervisord.conf restart nginx", { timeout: 10000 }, function (error, stdout, stderr) {
            if (error) {
                debug('Error configuring nginx. Reload nginx manually for now', error);
                updateApp(app, { statusCode: appdb.STATUS_NGINX_ERROR, statusMessage: error }, FATAL_CALLBACK);
                return callback(null);
            }

            updateApp(app, { statusCode: appdb.STATUS_NGINX_CONFIGURED, statusMessage: '', httpPort: freePort }, callback);
            // missing 'return' is intentional
        });

        forwardFromHostToVirtualBox(app.id + '-http', freePort);
    });
}

function downloadImage(app, callback) {
    debug('Will download app now');

    updateApp(app, { statusCode: appdb.STATUS_DOWNLOADING_IMAGE, statusMessage: '' }, FATAL_CALLBACK);

    var manifest = safe.JSON.parse(app.manifestJson);
    if (manifest === null) {
        debug('Error parsing manifest: ' + safe.error);
        updateApp(app, { statusCode: appdb.STATUS_MANIFEST_ERROR, statusMessage: 'Parse error:' + safe.error }, FATAL_CALLBACK);
        return callback(null);
    }
    if (!manifest.health_check_url || !manifest.docker_image || !manifest.http_port) {
        debug('Manifest missing mandatory parameters');
        updateApp(app, { statusCode: appdb.STATUS_MANIFEST_ERROR, statusMessage: 'Missing parameters' }, FATAL_CALLBACK);
        return callback(null);
    }

    docker.pull(manifest.docker_image, function (err, stream) {
        if (err) {
            debug('Error connecting to docker', err);
            updateApp(app, { statusCode: appdb.STATUS_DOWNLOAD_ERROR, statusMessage: 'Error connecting to docker' }, FATAL_CALLBACK);
            return callback(err);
        }

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug(JSON.stringify(data));

            if (data.status) {
                debug('Progress: ' + data.status); // progressDetail { current, total }
                updateApp(app, { statusCode: appdb.STATUS_DOWNLOADING_IMAGE, statusMessage: data.status }, FATAL_CALLBACK);
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
                    updateApp(app, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error inspecting image' }, FATAL_CALLBACK);
                    return callback(err);
                }
                if (!data.Config.Entrypoint && !data.Config.Cmd) {
                    debug('Only images with entry point are allowed');
                    updateApp(app, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'No entrypoint in image' }, FATAL_CALLBACK);
                    return callback(err);
                }

                debug('This image exposes ports: ' + JSON.stringify(data.Config.ExposedPorts));
                updateApp(app, { statusCode: appdb.STATUS_DOWNLOADED_IMAGE, statusMessage: '' }, callback);
            });
        });
    });
}

function createContainer(app, portConfigs, callback) {
    var manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()

    updateApp(app, { statusCode: appdb.STATUS_CREATING_CONTAINER, statusMessage: '' }, FATAL_CALLBACK);

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
            updateApp(app, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error creating container' }, FATAL_CALLBACK);
            return callback(err);
        }

        updateApp(app, { containerId: container.id, statusCode: appdb.STATUS_CREATED_CONTAINER, statusMessage: '' }, callback);
    });
}

function createVolume(app, callback) {
    var appDataDir = path.join(appDataRoot, app.id); // TODO: check if app.id is safe path

    updateApp(app, { statusCode: appdb.STATUS_CREATING_VOLUME, statusMessage: '' }, FATAL_CALLBACK);

    if (!safe.fs.mkdirSync(appDataDir)) {
        debug('Error creating app data directory ' + appDataDir + ' ' + safe.error);
        updateApp(app, { statusCode: appdb.STATUS_VOLUME_ERROR, statusMessage: 'Error creating data directory' }, FATAL_CALLBACK);
        return callback(safe.error);
    }

    updateApp(app, { statusCode: appdb.STATUS_CREATED_VOLUME, statusMessage: '' }, callback);
}

function startContainer(app, portConfigs, callback) {
    var manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()
    var appDataDir = path.join(appDataRoot, app.id); // TODO: check if app.id is safe path

    updateApp(app, { statusCode: appdb.STATUS_STARTING_CONTAINER, statusMessage: '' }, FATAL_CALLBACK);

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
            updateApp(app, { statusCode: appdb.STATUS_CONTAINER_ERROR, statusMessage: 'Error starting container' }, FATAL_CALLBACK);
            return callback(err);
        }

        updateApp(app, { statusCode: appdb.STATUS_STARTED_CONTAINER, statusMessage: '' }, FATAL_CALLBACK);
        return callback(null);
    });
}

function downloadManifest(app, callback) {
    debug('Downloading manifest for :', app.id);

    updateApp(app, { statusCode: appdb.STATUS_DOWNLOADING_MANIFEST, statusMessage: '' }, FATAL_CALLBACK);

    superagent
        .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
        .set('Accept', 'application/json')
        .end(function (error, res) {
            if (error) {
                debug('Error making request: ' + error.message);
                updateApp(app, { statusCode: appdb.STATUS_DOWNLOAD_ERROR, statusMessage: error.message }, FATAL_CALLBACK);
                return callback(null);
            }
            if (res.status !== 200) {
                debug('Error downloading manifest:' + res.body.status + ' ' + res.body.message);
                updateApp(app, { statusCode: appdb.STATUS_DOWNLOAD_ERROR, statusMessage: res.body.status + ' ' + res.body.message }, FATAL_CALLBACK);
                return callback(null);
            }

            debug('Downloaded application manifest: ' + res.text);
            updateApp(app, { statusCode: appdb.STATUS_DOWNLOADED_MANIFEST, statusMessage: '', manifestJson: res.text }, callback);
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

                app.statusCode = appdb.STATUS_UNINSTALLED;

                appdb.del(app.id, callback);
            });
        });
    });
}

function registerSubdomain(app, callback) {
    debug('Registering subdomain for ' + app.id + ' at ' + app.location + '.' + HOSTNAME);

    updateApp(app, { statusCode: appdb.STATUS_REGISTERING_SUBDOMAIN, statusMessage: '' }, FATAL_CALLBACK);

    superagent
        .post(appServerUrl + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .send({ subdomain: app.location, domain: HOSTNAME }) // TODO: the HOSTNAME should not be required
        .end(function (error, res) {
            if (error) {
                debug('Error making request: ' + error.message);
                updateApp(app, { statusCode: appdb.STATUS_SUBDOMAIN_ERROR, statusMessage: error.message }, FATAL_CALLBACK);
                return callback(null);
            }
            if (res.status !== 200) {
                debug('Error registering subdomain:' + res.body.status + ' ' + res.body.message);
                updateApp(app, { statusCode: appdb.STATUS_SUBDOMAIN_ERROR, statusMessage: res.body.status + ' ' + res.body.message }, FATAL_CALLBACK);
                return callback(null);
            }

            debug('Registered subdomain for ' + app.id);

            updateApp(app, { statusCode: appdb.STATUS_REGISTERED_SUBDOMAIN, statusMessage: '' }, callback);
        });
}

function unregisterSubdomain(app, callback) {
    debug('Unregistering subdomain for ' + app.id + ' at ' + app.location + '.' + HOSTNAME);
    superagent
        .del(appServerUrl + '/api/v1/subdomain/' + app.location)
        .end(function (error, res) {
            if (error) {
                debug('Error making request: ' + error.message);
                return callback(error);
            }
            if (res.status !== 201) {
                debug('Error unregistering subdomain:' + res.body.status + ' ' + res.body.message);
                return callback(new HttpError(res.status));
            }

            callback(null);
        });
}

function processAppState(app, callback) {
    switch (app.statusCode) {
    case appdb.STATUS_PENDING_INSTALL:
    case appdb.STATUS_NGINX_ERROR:
        getFreePort(function (error, freePort) {
            if (error) return callback(null);
            configureNginx(app, freePort, callback);
        });
        break;

    case appdb.STATUS_NGINX_CONFIGURED:
    case appdb.STATUS_REGISTERING_SUBDOMAIN:
    case appdb.STATUS_SUBDOMAIN_ERROR:
        registerSubdomain(app, callback);
        break;

    case appdb.STATUS_REGISTERED_SUBDOMAIN:
    case appdb.STATUS_MANIFEST_ERROR:
    case appdb.STATUS_IMAGE_ERROR:
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
        appdb.getPortBindings(app.id, function (error, portBindings) {
            if (error) portBindings = [ ]; // TODO: this is probably not good
            createContainer(app, portBindings, callback);
        });
        break;

    case appdb.STATUS_CREATED_CONTAINER:
    case appdb.STATUS_CREATING_VOLUME:
    case appdb.STATUS_VOLUME_ERROR:
        createVolume(app, callback);
        break;

    case appdb.STATUS_EXITED:
    case appdb.STATUS_CREATED_VOLUME:
    case appdb.STATUS_STARTING_CONTAINER:
    case appdb.STATUS_CONTAINER_ERROR:
        appdb.getPortBindings(app.id, function (error, portBindings) {
            if (error) portBindings = [ ]; // TODO: this is probably not good
            startContainer(app, portBindings, callback);
        });
        break;

    case appdb.STATUS_STARTED_CONTAINER:
        updateApp(app, { statusCode: appdb.STATUS_RUNNING, statusMessage: '' }, callback);
        break;

    case appdb.STATUS_PENDING_UNINSTALL:
        uninstall(app, callback);
        break;

    case appdb.STATUS_RUNNING:
    case appdb.STATUS_NOT_RESPONDING:
    case appdb.STATUS_EXITED:
        assert(true, 'Should not reach this state: ' + app.statusCode);
        break;
    }
}

function processApp(app, callback) {
    // keep processing this app until we hit an error or running/dead
    processAppState(app, function (error) {
        if (error) return callback(error);

        if (app.statusCode === appdb.STATUS_UNINSTALLED) {
            debug('app uninstalled, stopping');
            return callback(null);
        }

        if (app.statusCode.indexOf('_error', app.statusCode.length - 6) !== -1) {
            debug('app is in error state, stopping');
            return callback(null);
        }

        // move on
        if (app.statusCode === appdb.STATUS_RUNNING || app.statusCode === appdb.STATUS_NOT_RESPONDING || app.statusCode === appdb.STATUS_EXITED) {
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

