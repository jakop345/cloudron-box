'use strict';

var addons = require('./addons.js'),
    async = require('async'),
    assert = require('assert'),
    config = require('./config.js'),
    debug = require('debug')('box:src/appcontainer.js'),
    Docker = require('dockerode'),
    safe = require('safetydance'),
    semver = require('semver'),
    util = require('util');

exports = module.exports = {
    connection: connectionInstance(),
    downloadImage: downloadImage,
    createContainer: createContainer,
    startContainer: startContainer,
    stopContainer: stopContainer,
    deleteContainer: deleteContainer,
    deleteImage: deleteImage
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

    return '0.0.1';
}

function pullImage(manifest, callback) {
    var docker = exports.connection;

    docker.pull(manifest.dockerImage, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker. statusCode: %s' + err.statusCode));

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug('pullImage data: %j', data);

            // The information here is useless because this is per layer as opposed to per image
            if (data.status) {
                // debugApp(app, 'progress: %s', data.status); // progressDetail { current, total }
            } else if (data.error) {
                debug('pullImage error detail: %s', data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debug('downloaded image %s successfully', manifest.dockerImage);

            var image = docker.getImage(manifest.dockerImage);

            image.inspect(function (err, data) {
                if (err) return callback(new Error('Error inspecting image:' + err.message));
                if (!data || !data.Config) return callback(new Error('Missing Config in image:' + JSON.stringify(data, null, 4)));
                if (!data.Config.Entrypoint && !data.Config.Cmd) return callback(new Error('Only images with entry point are allowed'));

                debug('This image exposes ports: %j', data.Config.ExposedPorts);

                callback(null);
            });
        });

        stream.on('error', function (error) {
            debug('error pulling image %s : %j', manifest.dockerImage, error);

            callback(error);
        });
    });
}

function downloadImage(manifest, callback) {
    assert.strictEqual(typeof manifest, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('downloadImage %s', manifest.dockerImage);

    var attempt = 1;

    async.retry({ times: 5, interval: 15000 }, function (retryCallback) {
        debug('Downloading image. attempt: %s', attempt++);

        pullImage(manifest, function (error) {
            if (error) console.error(error);

            retryCallback(error);
        });
    }, callback);
}

function createSubcontainer(app, cmd, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!cmd || util.isArray(cmd));
    assert.strictEqual(typeof callback, 'function');

    var docker = exports.connection, isSubcontainer = !!cmd;

    var manifest = app.manifest;
    var exposedPorts = {}, dockerPortBindings = { };
    var stdEnv = [
        'CLOUDRON=1',
        'WEBADMIN_ORIGIN' + '=' + config.adminOrigin(),
        'API_ORIGIN' + '=' + config.adminOrigin()
    ];

    // docker portBindings requires ports to be exposed
    exposedPorts[manifest.httpPort + '/tcp'] = {};

    // On Mac (boot2docker), we have to export the port to external world for port forwarding from Mac to work
    dockerPortBindings[manifest.httpPort + '/tcp'] = [ { HostIp: '127.0.0.1', HostPort: app.httpPort + '' } ];

    var portEnv = [];
    for (var e in app.portBindings) {
        var hostPort = app.portBindings[e];
        var containerPort = manifest.tcpPorts[e].containerPort || hostPort;

        exposedPorts[containerPort + '/tcp'] = {};
        portEnv.push(e + '=' + hostPort);

        dockerPortBindings[containerPort + '/tcp'] = [ { HostIp: '0.0.0.0', HostPort: hostPort + '' } ];
    }

    var memoryLimit = manifest.memoryLimit || 1024 * 1024 * 200; // 200mb by default

    addons.getEnvironment(app, function (error, addonEnv) {
        if (error) return callback(new Error('Error getting addon environment : ' + error));

        var containerOptions = {
            name: app.id,
            Hostname: config.appFqdn(app.location),
            Tty: true,
            Image: app.manifest.dockerImage,
            Cmd: cmd,
            Env: stdEnv.concat(addonEnv).concat(portEnv),
            ExposedPorts: exposedPorts,
            Volumes: { // see also ReadonlyRootfs
                '/tmp': {},
                '/run': {}
            },
            Labels: {
                "location": app.location,
                "appId": app.id,
                "isSubcontainer": String(isSubcontainer)
            },
            HostConfig: {
                Binds: addons.getBindsSync(app, app.manifest.addons),
                Memory: memoryLimit / 2,
                MemorySwap: memoryLimit, // Memory + Swap
                PortBindings: dockerPortBindings,
                PublishAllPorts: false,
                ReadonlyRootfs: semver.gte(targetBoxVersion(app.manifest), '0.0.66'), // see also Volumes in startContainer
                Links: addons.getLinksSync(app, app.manifest.addons),
                RestartPolicy: {
                    "Name": "always",
                    "MaximumRetryCount": 0
                },
                CpuShares: 512, // relative to 1024 for system processes
                SecurityOpt: config.CLOUDRON ? [ "apparmor:docker-cloudron-app" ] : null // profile available only on cloudron
            },
            VolumesFrom: isSubcontainer ? [ app.containerId ] : []
        };

        // older versions wanted a writable /var/log
        if (semver.lte(targetBoxVersion(app.manifest), '0.0.71')) containerOptions.Volumes['/var/log'] = {};

        debugApp(app, 'Creating container for %s with options: %j', app.manifest.dockerImage, containerOptions);

        docker.createContainer(containerOptions, callback);
    });
}

function createContainer(app, callback) {
    createSubcontainer(app, null, callback);
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

function deleteImage(manifest, callback) {
    assert(!manifest || typeof manifest === 'object');
    assert.strictEqual(typeof callback, 'function');

    var dockerImage = manifest ? manifest.dockerImage : null;
    if (!dockerImage) return callback(null);

    var docker = exports.connection;

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

            if (error) debug('Error removing image %s : %j', dockerImage, error);

            callback(error);
        });
    });
}
