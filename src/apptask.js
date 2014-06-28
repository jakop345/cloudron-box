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
    HttpError = require('./httperror.js'),
    ejs = require('ejs');

exports = module.exports = {
    initialize: initialize,
    start: start
};

// FIXME: For some reason our selfhost.io certificate doesn't work with
// superagent and fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE
// Important to remove this before we release
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

var appServerUrl = config.appServerUrl,
    docker = null,
    appDataRoot = config.appDataRoot,
    nginxAppConfigDir = config.nginxAppConfigDir,
    HOSTNAME = process.env.HOSTNAME || os.hostname(),
    NGINX_APPCONFIG_EJS = fs.readFileSync(__dirname + '/nginx_appconfig.ejs', { encoding: 'utf8' });

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
    var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { vhost: app.location + '.' + HOSTNAME, port: freePort });

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
        .query({ token: config.token })
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
        .query({ token: config.token })
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

// updates the app object and the database
function updateApp(app, values, callback) {
    for (var value in values) {
        app[value] = values[value];
    }

    debug(app.id + ' code:' + app.installationState);

    appdb.update(app.id, values, callback);
}

// callback is called with error for fatal errors (and not for install errors)
function install(app, callback) {
    async.series([
        // configure nginx
        function (callback) {
            getFreePort(function (error, freePort) {
                if (error) return callback(error);
                configureNginx(app, freePort, function (error) {
                    if (error) return callback(new Error('Error configuring nginx: ' + error));

                    updateApp(app, { httpPort: freePort }, callback);
                });
            });
        },

        // register subdomain
        function (callback) {
            updateApp(app, { installationState: appdb.ISTATE_REGISTERING_SUBDOMAIN }, function (error) {
                if (error) return callback(error);

                registerSubdomain(app, function (error) {
                    if (error) return callback('Error registering subdomain: ' + error);

                    callback(null);
                });
            });
        },

        // download manifest
        function (callback) {
            updateApp(app, { installationState: appdb.ISTATE_DOWNLOADING_MANIFEST }, function (error) {
                if (error) return callback(error);

                downloadManifest(app, function (error, manifestJson) {
                    if (error) return callback('Error downloading manifest:' + error);

                    updateApp(app, { manifestJson: manifestJson }, callback);
                });
            });
        },

        // download the image
        function (callback) {
            updateApp(app, { installationState: appdb.ISTATE_DOWNLOADING_IMAGE }, function (error) {
                if (error) return callback(error);

                downloadImage(app, function (error) {
                    if (error) return callback('Error downloading image:' + error);

                    callback(null);
                });
            });
        },

        // create container
        function (callback) {
            appdb.getPortBindings(app.id, function (error, portBindings) {
                if (error) return callback(error);

                updateApp(app, { installationState: appdb.ISTATE_CREATING_CONTAINER }, function (error) {
                    if (error) return callback(error);

                    createContainer(app, portBindings, function (error, containerId) {
                        if (error) return callback('Error creating container:' + error);

                        updateApp(app, { containerId: containerId }, callback);
                    });
                });
            });
        },

        // create data volume
        function (callback) {
            updateApp(app, { installationState: appdb.ISTATE_CREATING_VOLUME }, function (error) {
                if (error) return callback(error);

                createVolume(app, function (error) {
                    if (error) return callback('Error creating volume: ' + error);

                    callback(null);
                });
            });
        },

        // done!
        function (callback) {
            updateApp(app, { installationState: appdb.ISTATE_INSTALLED }, callback);
        }
    ], function (error) {
        if (error) {
            debug(error.message);
            return updateApp(app, { installationState: appdb.ISTATE_ERROR }, callback);
        }

        callback(null);
    });
}

function runApp(app, callback) {
    appdb.getPortBindings(app.id, function (error, portBindings) {
        if (error) return callback(error);

        startContainer(app, portBindings, function (error) {
            if (error) {
                debug('Error creating container:' + error);
                return updateApp(app, { runState: appdb.RSTATE_ERROR }, callback);
            }

            updateApp(app, { runState: appdb.RSTATE_RUNNING }, callback);
        });
    });
}

function start(appId, callback) {
    appdb.get(appId, function (error, app) {
        if (error) return callback(error);
        if (app.installationState === 'pending_uninstall') {
            uninstall(app, callback);
            return;
        }

        install(app, function (error) {
            if (error) return callback(error);

            runApp(app, callback);
        });
    });
}

if (require.main === module) {
    assert(process.argv.length === 3, 'Pass the appid as argument');

    debug('Apptask for ' + process.argv[2]);

    initialize();

    start(process.argv[2], function (error) {
        debug('Apptask completed for ' + process.argv[2] + ' ' + error);
        process.exit(error ? 1 : 0);
    });
}

