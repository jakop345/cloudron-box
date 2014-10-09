#!/usr/bin/env node

/* jslint node:true */

'use strict';

require('supererror');

var assert = require('assert'),
    Docker = require('dockerode'),
    superagent = require('superagent'),
    async = require('async'),
    uuid = require('node-uuid'),
    os = require('os'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    clientdb = require('./clientdb.js'),
    debug = require('debug')('box:apptask'),
    fs = require('fs'),
    child_process = require('child_process'),
    path = require('path'),
    net = require('net'),
    config = require('../config.js'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    ejs = require('ejs'),
    appFqdn = require('./apps').appFqdn;

exports = module.exports = {
    initialize: initialize,
    startTask: startTask,
    setNakedDomain: setNakedDomain,

    // exported for testing
    _getFreePort: getFreePort,
    _configureNginx: configureNginx,
    _unconfigureNginx: unconfigureNginx,
    _setNakedDomain: setNakedDomain,
    _createVolume: createVolume,
    _deleteVolume: deleteVolume,
    _allocateOAuthCredentials: allocateOAuthCredentials,
    _removeOAuthCredentials: removeOAuthCredentials,
    _downloadManifest: downloadManifest,
    _registerSubdomain: registerSubdomain,
    _unregisterSubdomain: unregisterSubdomain,
    _reloadNginx: reloadNginx
};

var docker = null,
    NGINX_APPCONFIG_EJS = fs.readFileSync(__dirname + '/../nginx/appconfig.ejs', { encoding: 'utf8' }),
    COLLECTD_CONFIG_EJS = fs.readFileSync(__dirname + '/collectd.config.ejs', { encoding: 'utf8' }),
    RELOAD_NGINX_CMD = 'sudo ' + path.join(__dirname, 'scripts/reloadnginx.sh'),
    RELOAD_COLLECTD_CMD = 'sudo ' + path.join(__dirname, 'scripts/reloadcollectd.sh');

function initialize(callback) {
    if (process.env.NODE_ENV === 'test') {
        docker = new Docker({ host: 'http://localhost', port: 5687 });
    } else if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 2375 });
    }

    database.initialize(callback);
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
            'VBoxManage controlvm boot2docker-vm natpf1 delete ' + rulename + ';' +
            'VBoxManage controlvm boot2docker-vm natpf1 ' + rulename + ',tcp,127.0.0.1,' + port + ',,' + port);
    }
}

function reloadNginx(callback) {
    child_process.exec(RELOAD_NGINX_CMD, { timeout: 10000 }, callback);
}

function configureNginx(app, callback) {
    getFreePort(function (error, freePort) {
        if (error) return callback(error);

        var sourceDir = path.resolve(__dirname, '..');
        var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, vhost: appFqdn(app.location), port: freePort });

        var nginxConfigFilename = path.join(config.nginxAppConfigDir, app.id + '.conf');
        debug('writing config to ' + nginxConfigFilename);

        fs.writeFile(nginxConfigFilename, nginxConf, function (error) {
            if (error) return callback(error);

            exports._reloadNginx(function (error) {
                if (error) return callback(error);
                updateApp(app, { httpPort: freePort }, callback);
            });

            forwardFromHostToVirtualBox(app.id + '-http', freePort);
        });
    });
}

function unconfigureNginx(app, callback) {
    var nginxConfigFilename = path.join(config.nginxAppConfigDir, app.id + '.conf');
    if (!safe.fs.unlinkSync(nginxConfigFilename)) {
        console.error('Error removing nginx configuration ' + safe.error);
        return callback(null);
    }

    exports._reloadNginx(callback);
}

function setNakedDomain(app, callback) {
    var sourceDir = path.resolve(__dirname, '..');
    var nginxConf = app ? ejs.render(NGINX_APPCONFIG_EJS, { sourceDir: sourceDir, vhost: config.fqdn, port: app.httpPort }) : '';

    var nginxNakedDomainFilename = path.join(config.nginxConfigDir, 'naked_domain.conf');
    debug('writing naked domain config to ' + nginxNakedDomainFilename);

    fs.writeFile(nginxNakedDomainFilename, nginxConf, function (error) {
        if (error) return callback(error);

        exports._reloadNginx(callback);
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

        var env = [ ];
        for (var containerPort in manifest.tcpPorts) {
            if (!(containerPort in portBindings)) continue;
            env.push(manifest.tcpPorts[containerPort].environmentVariable + '=' + portBindings[containerPort]);
        }

        env.push('APP_ORIGIN' + '=' + 'https://' + appFqdn(app.location));
        env.push('ADMIN_ORIGIN' + '=' + config.adminOrigin);
        env.push('MAIL_SERVER' + '=' + config.mailServer);
        env.push('MAIL_USERNAME' + '=' + app.location);
        env.push('MAIL_DOMAIN' + '=' + config.fqdn);

        // add oauth variables
        clientdb.getByAppId(app.id, function (error, client) {
            if (error) return callback(new Error('Error getting oauth info:', + error));

            env.push('OAUTH_CLIENT_ID' + '=' + client.clientId);
            env.push('OAUTH_CLIENT_SECRET' + '=' + client.clientSecret);

            var containerOptions = {
                Hostname: appFqdn(app.location),
                Tty: true,
                Image: manifest.dockerImage,
                Cmd: null,
                Volumes: { },
                VolumesFrom: '',
                Env: env
            };

            debug('Creating container for ' + manifest.dockerImage);

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
    var appDataDir = path.join(config.appDataRoot, app.id);

    if (!safe.fs.mkdirSync(appDataDir)) {
        return callback(new Error('Error creating app data directory ' + appDataDir + ' ' + safe.error));
    }

    return callback(null);
}

function deleteVolume(app, callback) {
    child_process.exec('sudo ' + __dirname + '/scripts/rmappdir.sh ' + app.id, function (error, stdout, stderr) {
        if (error) console.error('Error removing volume', error, stdout, stderr);
        return callback(error);
    });
}

function addCollectdProfile(app, callback) {
    var collectdConf = ejs.render(COLLECTD_CONFIG_EJS, { appId: app.id, containerId: app.containerId });
    fs.writeFile(path.join(config.collectdAppConfigDir, app.id + '.conf'), collectdConf, function (error) {
        if (error) return callback(error);
        child_process.exec(RELOAD_COLLECTD_CMD, { timeout: 10000 }, callback);
    });
}

function removeCollectdProfile(app, callback) {
    fs.unlink(path.join(config.collectdAppConfigDir, app.id + '.conf'), function (error, stdout, stderr) {
        if (error) console.error('Error removing collectd profile', error, stdout, stderr);
        child_process.exec(RELOAD_COLLECTD_CMD, { timeout: 10000 }, callback);
    });
}

function allocateOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var id = uuid.v4();
    var appId = app.id;
    var clientId = 'cid-' + uuid.v4();
    var clientSecret = uuid.v4();
    var name = app.manifest.title;
    var redirectURI = 'https://' + appFqdn(app.location);

    debug('allocateOAuthCredentials:', id, clientId, clientSecret, name);

    clientdb.getByAppId(appId, function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return callback(error);
        if (result) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));

        clientdb.add(id, appId, clientId, clientSecret, name, redirectURI, callback);
    });
}

function removeOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('removeOAuthCredentials:', app.id);

    clientdb.delByAppId(app.id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null);
        if (error) console.error(error);

        callback(null);
    });
}

function startContainer(app, callback) {
    appdb.getPortBindings(app.id, function (error, portConfigs) {
        if (error) return callback(error);

        var manifest = app.manifest;
        var appDataDir = path.join(config.appDataRoot, app.id);

        var portBindings = { };
        portBindings[manifest.httpPort + '/tcp'] = [ { HostPort: app.httpPort + '' } ];

        for (var containerPort in manifest.tcpPorts) {
            if (!(containerPort in portConfigs)) continue;
            portBindings[containerPort + '/tcp'] = [ { HostPort: portConfigs[containerPort] } ];
            forwardFromHostToVirtualBox(app.id + '-tcp' + containerPort, portConfigs[containerPort]);
        }

        var startOptions = {
            Binds: [ appDataDir + ':/app/data:rw' ],
            PortBindings: portBindings,
            PublishAllPorts: false
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
        if (error && (error.statusCode !== 304 || error.statusCode !== 404)) return callback(new Error('Error stopping container:' + error));

        return callback(null);
    });

}

// NOTE: keep this in sync with appstore's apps.js
function validateManifest(manifest) {
     if (manifest === null) return new Error('Unable to parse manifest: ' + safe.error.message);

     var fields = [ 'version', 'dockerImage', 'healthCheckPath', 'httpPort', 'title' ];

     for (var i = 0; i < fields.length; i++) {
         var field = fields[i];
         if (!(field in manifest)) return new Error('Missing ' + field + ' in manifest');

         if (typeof manifest[field] !== 'string') return new Error(field + ' must be a string');

         if (manifest[field].length === 0) return new Error(field + ' cannot be empty');
     }

    return null;
}

function downloadManifest(app, callback) {
    debug('Downloading manifest for :', app.id);

    superagent
        .get(config.appServerUrl + '/api/v1/appstore/apps/' + app.appStoreId + '/manifest')
        .set('Accept', 'application/json')
        .end(function (err, res) {
            if (err) return callback(err);

            if (res.status !== 200) return callback(new Error('Error downloading manifest. Status' + res.status + '. ' + JSON.stringify(res.body)));

            debug('Downloaded application manifest: ' + res.text);

            var manifest = safe.JSON.parse(res.text);
            var error = validateManifest(manifest);
            if (error) return callback(new Error('Manifest error:' + error.message));

            if (manifest.icon) {
                safe.fs.writeFileSync(config.iconsRoot + '/' + app.id + '.png', new Buffer(manifest.icon));

                // delete icon buffer, so we don't store it in the db
                delete manifest.icon;
            }

            updateApp(app, { manifest: manifest, version: manifest.version }, callback);
        });
}

function registerSubdomain(app, callback) {
    if (!config.token) {
        debug('Skipping subdomain registration for development');
        return callback(null);
    }

    debug('Registering subdomain for ' + app.id + ' at ' + app.location);

    var record = { subdomain: app.location, appId: app.id, type: 'A' };

    superagent
        .post(config.appServerUrl + '/api/v1/subdomains')
        .set('Accept', 'application/json')
        .query({ token: config.token })
        .send({ records: [ record ] })
        .end(function (error, res) {
            if (error) return callback(error);

            debug('Registered subdomain for ' + app.id + ' ' + res.status);

            if (res.status === 409) return callback(null); // already registered
            if (res.status !== 201) return callback(new Error('Subdomain Registration failed. Status:' + res.status + '. ' + JSON.stringify(res.body)));

            updateApp(app, { dnsRecordId: res.body.ids[0] }, callback);
        });
}

function unregisterSubdomain(app, callback) {
    if (!config.token) {
        debug('Skipping subdomain unregistration for development');
        return callback(null);
    }

    debug('Unregistering subdomain for ' + app.id + ' at ' + app.location);
    superagent
        .del(config.appServerUrl + '/api/v1/subdomains/' + app.dnsRecordId)
        .query({ token: config.token })
        .end(function (error, res) {
            if (error) {
                console.error('Error making request: ', error);
            } else if (res.status !== 200) {
                console.error('Error unregistering subdomain:', res.status, res.body);
            }

            updateApp(app, { dnsRecordId: null }, function (error) {
                if (error) console.error(error);
                callback(null);
            });
        });
}

function removeIcon(app, callback) {
    fs.unlink(config.dataRoot + '/icons/' + app.id + '.png', function (error) {
        if (error && error.code !== 'ENOENT') console.error(error);
        callback(null);
    });
}

// updates the app object and the database
function updateApp(app, values, callback) {
    for (var value in values) {
        app[value] = values[value];
    }

    debug(app.id + ' installationState:' + app.installationState);

    appdb.update(app.id, values, callback);
}

function install(app, callback) {
    async.series([
        // configure nginx
        configureNginx.bind(null, app),

        // register subdomain
        updateApp.bind(null, app, { installationProgress: 'Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // download manifest
        updateApp.bind(null, app, { installationProgress: 'Downloading manifest' }),
        downloadManifest.bind(null, app),

        // download the image
        updateApp.bind(null, app, { installationProgress: 'Downloading image' }),
        downloadImage.bind(null, app),

        // allocate OAuth credentials
        updateApp.bind(null, app, { installationProgress: 'Setting up OAuth' }),
        removeOAuthCredentials.bind(null, app),
        allocateOAuthCredentials.bind(null, app),

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
    async.series([
        // unconfigure nginx in case of FQDN change
        updateApp.bind(null, app, { installationProgress: 'Unconfiguring nginx' }),
        unconfigureNginx.bind(null, app),

        // configure nginx
        updateApp.bind(null, app, { installationProgress: 'Configuring nginx' }),
        configureNginx.bind(null, app),

        // register subdomain
        updateApp.bind(null, app, { installationProgress: 'Registering subdomain' }),
        registerSubdomain.bind(null, app),

        // download manifest FIXME: should we restore to app.version ?
        updateApp.bind(null, app, { installationProgress: 'Downloading manifest' }),
        downloadManifest.bind(null, app),

        // download the image
        updateApp.bind(null, app, { installationProgress: 'Downloading image' }),
        downloadImage.bind(null, app),

        // remove OAuth credentials in case of FQDN change
        updateApp.bind(null, app, { installationProgress: 'Remove old oauth credentials' }),
        removeOAuthCredentials.bind(null, app),

        // add OAuth credentials
        updateApp.bind(null, app, { installationProgress: 'Setting up OAuth' }),
        allocateOAuthCredentials.bind(null, app),

        // create container
        updateApp.bind(null, app, { installationProgress: 'Creating container' }),
        createContainer.bind(null, app),

        // add collectd profile
        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        addCollectdProfile.bind(null, app),

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

        updateApp.bind(null, app, { installationProgress: 'Unconfiguring nginx' }),
        unconfigureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Remove old oauth credentials' }),
        removeOAuthCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Unregistering subdomain' }),
        unregisterSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Configuring Nginx' }),
        configureNginx.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Registering subdomain' }),
        registerSubdomain.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Setting up OAuth' }),
        allocateOAuthCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Creating container' }),
        createContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        addCollectdProfile.bind(null, app),

        runApp.bind(null, app),

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

function update(app, callback) {
    async.series([
        updateApp.bind(null, app, { installationProgress: 'Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Downloading manifest' }),
        downloadManifest.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Downloading image' }),
        downloadImage.bind(null, app),

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

        updateApp.bind(null, app, { installationProgress: 'Stopping app' }),
        stopApp.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting container' }),
        deleteContainer.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Add collectd profile' }),
        removeCollectdProfile.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting image' }),
        deleteImage.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Remove OAuth credentials' }),
        removeOAuthCredentials.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Deleting volume' }),
        deleteVolume.bind(null, app),

        updateApp.bind(null, app, { installationProgress: 'Unregistering subdomain' }),
        unregisterSubdomain.bind(null, app),

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

