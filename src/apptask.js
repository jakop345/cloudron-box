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
    debug = require('debug')('apptask'),
    fs = require('fs'),
    child_process = require('child_process'),
    path = require('path'),
    net = require('net');

exports = module.exports = {
    initialize: initialize,
    refresh: refresh
};

var NOOP_CALLBACK = function (error) { if (error) console.error(error); }

var appServerUrl = null, docker = null,
    refreshing = false, pendingRefresh = false,
    nginxAppConfigDir = null,
    HOSTNAME = process.env.HOSTNAME || os.hostname();

var appHealth = (function () {
    var data = { };
    var MAX_HEALTH = 5;

    return {
        ensure: function (appId) {
            // FIXME: this function must be removed when we have proper restart support
            if (!data.hasOwnProperty(appId)) data[appId] = MAX_HEALTH;
        },

        get: function (appId) {
            return data[appId] || 0;
        },

        register: function (appId) {
            assert(!data.hasOwnProperty(appId));
            assert(typeof appId === 'string');

            data[appId] = MAX_HEALTH;
        },
        unregister: function (appId) {
            assert(typeof appId === 'string');

            delete data[appId];
        },
        increment: function (appId) {
            assert(typeof appId === 'string');

            this.ensure(appId);
            data[appId] = Math.max(data[appId] + 1, MAX_HEALTH);
            return data[appId];
        },
        decrement: function (appId) {
            assert(typeof appId === 'string');

            this.ensure(appId);
            return --data[appId];
        }
    };
})();

function initialize(_appServerUrl, _nginxAppConfigDir) {
    assert(typeof _appServerUrl === 'string');
    assert(typeof _nginxAppConfigDir === 'string');

    appServerUrl = _appServerUrl;
    nginxAppConfigDir = _nginxAppConfigDir;

    if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 4243 });
    }

    setInterval(refresh, 3000);
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
        + "    listen 80;\n"
        + "    server_name #APP_SUBDOMAIN#;\n"
        + "    # proxy_intercept_errors on;\n"
        + "    # error_page 500 502 503 504 = @install_progress;\n"
        + "    location / {\n"
        + "        proxy_pass http://127.0.0.1:#PORT#;\n"
        + "    }\n"
        + "}\n";

    var nginxConf =
        NGINX_APPCONFIG_TEMPLATE.replace('#APP_SUBDOMAIN#', app.location + '.' + HOSTNAME)
        .replace('#PORT#', freePort);

    var nginxConfigFilename = path.join(nginxAppConfigDir, app.location + '.conf');
    debug('writing config to ' + nginxConfigFilename);

    fs.writeFile(nginxConfigFilename, nginxConf, function (error) {
        if (error) {
            debug('Error writing nginx config : ' + error);
            appdb.update(app.id, { statusCode: appdb.STATUS_NGINX_ERROR, statusMessage: error }, NOOP_CALLBACK);
            return callback(null);
        }

        child_process.exec("supervisorctl restart nginx", { timeout: 10000 }, function (error, stdout, stderr) {
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
                if (err || !data || !data.config) {
                    debug('Error inspecting image');
                    appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error inspecting image' }, NOOP_CALLBACK);
                    return callback(err);
                }
                if (!data.config.Entrypoint && !data.config.Cmd) {
                    debug('Only images with entry point are allowed');
                    appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'No entrypoint in image' }, NOOP_CALLBACK);
                    return callback(err);
                }

                debug('This image exposes ports: ' + JSON.stringify(data.config.ExposedPorts));
                appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADED_IMAGE, statusMessage: '' }, callback);
            });
        });
    });
};

function startApp(app, callback) {
    var outputStream = new Writable(),
        manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()

    outputStream._write = function (chunk, enc, callback) {
        console.log('CHUNK: ' + chunk);
        callback();
    };

    var env = [ ];
    var portBindings = { };
    portBindings[manifest.http_port + '/tcp'] = [ { HostPort: app.httpPort + '' } ];
    if (typeof manifest.tcp_ports === 'object' && app.internalPort in manifest.tcp_ports) {
        portBindings[app.internalPort + '/tcp'] = [ { HostPort: app.externalPort + '' } ];
        env.push(manifest.tcp_ports[app.internalPort].environment_variable + '=' + app.externalPort);
        forwardFromHostToVirtualBox(app.id + '-tcp' + app.internalPort, app.externalPort);
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

    debug('Running ' + manifest.docker_image);

    appdb.update(app.id, { statusCode: appdb.STATUS_STARTING_UP, statusMessage: '' }, NOOP_CALLBACK);

    docker.createContainer(containerOptions, function (err, container) {
        if (err) {
            debug('Error creating container');
            appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error creating container' }, NOOP_CALLBACK);
            return callback(err);
        }

        // TODO: should wait for update to complete
        appdb.update(app.id, { containerId: container.id }, NOOP_CALLBACK);

        var startOptions = {
            // Binds: [ '/tmp:/tmp:rw' ],
            PortBindings: portBindings,
            PublishAllPorts: false,
            Env: env
        };

        debug('Starting container ' + container.id + ' with options: ' + JSON.stringify(startOptions));

        container.start(startOptions, function (err, data) {
            if (err) {
                debug('Error starting container', err);
                appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error starting container' }, NOOP_CALLBACK);
                return callback(err);
            }

            appHealth.register(app.id);

            appdb.update(app.id, { statusCode: appdb.STATUS_STARTED, statusMessage: '' }, callback);
        });
    });
};

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
};

function uninstall(app, callback) {
    var container = docker.getContainer(app.containerId);

    var removeOptions = {
        force: true, // kill container if it's running
        v: true // removes volumes associated with the container
    };

    container.remove(removeOptions, function (error) {
        if (error) {
            debug('Error removing container:' + JSON.stringify(error));
            // TODO: now what?
        }

        appHealth.unregister(app.id);

        appdb.del(app.id, callback);
    });
};

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
            appHealth[app.id].health = 0;
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
                appHealth.increment(app.id);
                appdb.update(app.id, { statusCode: appdb.STATUS_RUNNING, statusMessage: healthCheckUrl }, NOOP_CALLBACK);
                callback(null);
            }
        });
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
            case appdb.STATUS_EXITED:
                startApp(app, callback);
                break;

            case appdb.STATUS_PENDING_UNINSTALL:
                uninstall(app, callback);
                break;

            case appdb.STATUS_STARTING_UP:
                 // TODO: kill any existing container

            case appdb.STATUS_STARTED:
            case appdb.STATUS_RUNNING:
                checkAppHealth(app, callback);
                break;

            case appdb.STATUS_DEAD: // TODO: restart DEAD apps with threshold
                callback(null);
                break;

            case appdb.STATUS_IMAGE_ERROR:
                 // do nothing: let user retry again
                callback(null);
                break;
            }
        }, function callback(err) {
            refreshing = false;
            if (pendingRefresh) process.nextTick(refresh);
            pendingRefresh = false;
        });

    });
};
