'use strict';

var addons = require('./addons.js'),
    async = require('async'),
    assert = require('assert'),
    config = require('./config.js'),
    constants = require('./constants.js'),
    debug = require('debug')('box:src/docker.js'),
    Docker = require('dockerode'),
    safe = require('safetydance'),
    semver = require('semver'),
    util = require('util'),
    _ = require('underscore');

exports = module.exports = {
    connection: connectionInstance(),
    downloadImage: downloadImage,
    createContainer: createContainer,
    startContainer: startContainer,
    stopContainer: stopContainer,
    stopContainerByName: stopContainer,
    stopContainers: stopContainers,
    deleteContainer: deleteContainer,
    deleteContainerByName: deleteContainer,
    deleteImage: deleteImage,
    deleteContainers: deleteContainers,
    createSubcontainer: createSubcontainer
};

function connectionInstance() {
    var docker;

    if (process.env.BOX_ENV === 'test') {
        // test code runs a docker proxy on this port
        docker = new Docker({ host: 'http://localhost', port: 5687 });

        // proxy code uses this to route to the real docker
        docker.options = { socketPath: '/var/run/docker.sock' };
    } else {
        docker = new Docker({ socketPath: '/var/run/docker.sock' });
    }

    return docker;
}

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? (app.location || '(bare)') : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

function targetBoxVersion(manifest) {
    if ('targetBoxVersion' in manifest) return manifest.targetBoxVersion;

    if ('minBoxVersion' in manifest) return manifest.minBoxVersion;

    return '99999.99999.99999'; // compatible with the latest version
}

function pullImage(manifest, callback) {
    var docker = exports.connection;

    docker.pull(manifest.dockerImage, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker. statusCode: %s' + err.statusCode));

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug('pullImage %s: %j', manifest.id, data);

            // The information here is useless because this is per layer as opposed to per image
            if (data.status) {
            } else if (data.error) {
                debug('pullImage error %s: %s', manifest.id, data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debug('downloaded image %s of %s successfully', manifest.dockerImage, manifest.id);

            var image = docker.getImage(manifest.dockerImage);

            image.inspect(function (err, data) {
                if (err) return callback(new Error('Error inspecting image:' + err.message));
                if (!data || !data.Config) return callback(new Error('Missing Config in image:' + JSON.stringify(data, null, 4)));
                if (!data.Config.Entrypoint && !data.Config.Cmd) return callback(new Error('Only images with entry point are allowed'));

                debug('This image of %s exposes ports: %j', manifest.id, data.Config.ExposedPorts);

                callback(null);
            });
        });

        stream.on('error', function (error) {
            debug('error pulling image %s of %s: %j', manifest.dockerImage, manifest.id, error);

            callback(error);
        });
    });
}

function downloadImage(manifest, callback) {
    assert.strictEqual(typeof manifest, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('downloadImage %s %s', manifest.id, manifest.dockerImage);

    var attempt = 1;

    async.retry({ times: 10, interval: 15000 }, function (retryCallback) {
        debug('Downloading image %s %s. attempt: %s', manifest.id, manifest.dockerImage, attempt++);

        pullImage(manifest, function (error) {
            if (error) console.error(error);

            retryCallback(error);
        });
    }, callback);
}

function createSubcontainer(app, name, cmd, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof name, 'string');
    assert(!cmd || util.isArray(cmd));
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var docker = exports.connection,
        isAppContainer = !cmd;

    var manifest = app.manifest;
    var developmentMode = !!manifest.developmentMode;
    var exposedPorts = {}, dockerPortBindings = { };
    var stdEnv = [
        'CLOUDRON=1',
        'WEBADMIN_ORIGIN=' + config.adminOrigin(),
        'API_ORIGIN=' + config.adminOrigin(),
        'APP_ORIGIN=https://' + config.appFqdn(app.location),
        'APP_DOMAIN=' + config.appFqdn(app.location)
    ];

    // docker portBindings requires ports to be exposed
    exposedPorts[manifest.httpPort + '/tcp'] = {};

    dockerPortBindings[manifest.httpPort + '/tcp'] = [ { HostIp: '127.0.0.1', HostPort: app.httpPort + '' } ];

    var portEnv = [];
    for (var e in app.portBindings) {
        var hostPort = app.portBindings[e];
        var containerPort = manifest.tcpPorts[e].containerPort || hostPort;

        exposedPorts[containerPort + '/tcp'] = {};
        portEnv.push(e + '=' + hostPort);

        dockerPortBindings[containerPort + '/tcp'] = [ { HostIp: '0.0.0.0', HostPort: hostPort + '' } ];
    }

    // first check db record, then manifest
    var memoryLimit = app.memoryLimit || manifest.memoryLimit;

    // ensure we never go below minimum
    memoryLimit = memoryLimit < constants.DEFAULT_MEMORY_LIMIT ? constants.DEFAULT_MEMORY_LIMIT : memoryLimit; // 256mb by default

    // developerMode does not restrict memory usage
    memoryLimit = developmentMode ? 0 : memoryLimit;

    // for subcontainers, this should ideally be false. but docker does not allow network sharing if the app container is not running
    // this means cloudron exec does not work
    var isolatedNetworkNs = true;

    addons.getEnvironment(app, function (error, addonEnv) {
        if (error) return callback(new Error('Error getting addon environment : ' + error));

        var containerOptions = {
            name: name, // used for filtering logs
            // do _not_ set hostname to app fqdn. doing so sets up the dns name to look up the internal docker ip. this makes curl from within container fail
            // for subcontainers, this should not be set because we already share the network namespace with app container
            Hostname: isolatedNetworkNs ? (semver.gte(targetBoxVersion(app.manifest), '0.0.77') ? app.location : config.appFqdn(app.location)) : null,
            Tty: isAppContainer,
            Image: app.manifest.dockerImage,
            Cmd: (isAppContainer && developmentMode) ? [ '/bin/bash', '-c', 'echo "Development mode. Use cloudron exec to debug. Sleeping" && sleep infinity' ] : cmd,
            Env: stdEnv.concat(addonEnv).concat(portEnv),
            ExposedPorts: isAppContainer ? exposedPorts : { },
            Volumes: { // see also ReadonlyRootfs
                '/tmp': {},
                '/run': {}
            },
            Labels: {
                "location": app.location,
                "appId": app.id,
                "isSubcontainer": String(!isAppContainer)
            },
            HostConfig: {
                Binds: addons.getBindsSync(app, app.manifest.addons),
                Memory: memoryLimit / 2,
                MemorySwap: memoryLimit, // Memory + Swap
                PortBindings: isAppContainer ? dockerPortBindings : { },
                PublishAllPorts: false,
                ReadonlyRootfs: !developmentMode, // see also Volumes in startContainer
                RestartPolicy: {
                    "Name": isAppContainer ? "always" : "no",
                    "MaximumRetryCount": 0
                },
                CpuShares: 512, // relative to 1024 for system processes
                VolumesFrom: isAppContainer ? null : [ app.containerId + ":rw" ],
                NetworkMode: isolatedNetworkNs ? 'default' : ('container:' + app.containerId), // share network namespace with parent
                Links: isolatedNetworkNs ? addons.getLinksSync(app, app.manifest.addons) : null, // links is redundant with --net=container
                SecurityOpt: config.CLOUDRON ? [ "apparmor:docker-cloudron-app" ] : null // profile available only on cloudron
            }
        };
        containerOptions = _.extend(containerOptions, options);

        debugApp(app, 'Creating container for %s with options %j', app.manifest.dockerImage, containerOptions);

        docker.createContainer(containerOptions, callback);
    });
}

function createContainer(app, callback) {
    createSubcontainer(app, app.id /* name */, null /* cmd */, { } /* options */, callback);
}

function startContainer(containerId, callback) {
    assert.strictEqual(typeof containerId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var docker = exports.connection;

    var container = docker.getContainer(containerId);
    debug('Starting container %s', containerId);

    container.start(function (error) {
        if (error && error.statusCode !== 304) return callback(new Error('Error starting container :' + error));

        return callback(null);
    });
}

function stopContainer(containerId, callback) {
    assert(!containerId || typeof containerId === 'string');
    assert.strictEqual(typeof callback, 'function');

    if (!containerId) {
        debug('No previous container to stop');
        return callback();
    }

    var docker = exports.connection;
    var container = docker.getContainer(containerId);
    debug('Stopping container %s', containerId);

    var options = {
        t: 10 // wait for 10 seconds before killing it
    };

    container.stop(options, function (error) {
        if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error stopping container:' + error));

        debug('Waiting for container ' + containerId);

        container.wait(function (error, data) {
            if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error waiting on container:' + error));

            debug('Container %s stopped with status code [%s]', containerId, data ? String(data.StatusCode) : '');

            return callback(null);
        });
    });
}

function deleteContainer(containerId, callback) {
    assert(!containerId || typeof containerId === 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('deleting container %s', containerId);

    if (containerId === null) return callback(null);

    var docker = exports.connection;
    var container = docker.getContainer(containerId);

    var removeOptions = {
        force: true, // kill container if it's running
        v: true // removes volumes associated with the container (but not host mounts)
    };

    container.remove(removeOptions, function (error) {
        if (error && error.statusCode === 404) return callback(null);

        if (error) debug('Error removing container %s : %j', containerId, error);

        callback(error);
    });
}

function deleteContainers(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var docker = exports.connection;

    debug('deleting containers of %s', appId);

    docker.listContainers({ all: 1, filters: JSON.stringify({ label: [ 'appId=' + appId ] }) }, function (error, containers) {
        if (error) return callback(error);

        async.eachSeries(containers, function (container, iteratorDone) {
            deleteContainer(container.Id, iteratorDone);
        }, callback);
    });
}

function stopContainers(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var docker = exports.connection;

    debug('stopping containers of %s', appId);

    docker.listContainers({ all: 1, filters: JSON.stringify({ label: [ 'appId=' + appId ] }) }, function (error, containers) {
        if (error) return callback(error);

        async.eachSeries(containers, function (container, iteratorDone) {
            stopContainer(container.Id, iteratorDone);
        }, callback);
    });
}

function deleteImage(manifest, callback) {
    assert(!manifest || typeof manifest === 'object');
    assert.strictEqual(typeof callback, 'function');

    var dockerImage = manifest ? manifest.dockerImage : null;
    if (!dockerImage) return callback(null);

    var docker = exports.connection;

    var removeOptions = {
        force: false, // might be shared with another instance of this app
        noprune: false // delete untagged parents
    };

    // registry v1 used to pull down all *tags*. this meant that deleting image by tag was not enough (since that
    // just removes the tag). we used to remove the image by id. this is not required anymore because aliases are
    // not created anymore after https://github.com/docker/docker/pull/10571
    docker.getImage(dockerImage).remove(removeOptions, function (error) {
        if (error && error.statusCode === 404) return callback(null);
        if (error && error.statusCode === 409) return callback(null); // another container using the image

        if (error) debug('Error removing image %s : %j', dockerImage, error);

        callback(error);
    });
}
