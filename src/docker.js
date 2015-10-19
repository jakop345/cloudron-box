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

function pullImage(app, callback) {
    var docker = exports.connection;

    docker.pull(app.manifest.dockerImage, function (err, stream) {
        if (err) return callback(new Error('Error connecting to docker. statusCode: %s' + err.statusCode));

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debugApp(app, 'pullImage data: %j', data);

            // The information here is useless because this is per layer as opposed to per image
            if (data.status) {
                // debugApp(app, 'progress: %s', data.status); // progressDetail { current, total }
            } else if (data.error) {
                debugApp(app, 'pullImage error detail: %s', data.errorDetail.message);
            }
        });

        stream.on('end', function () {
            debugApp(app, 'download image successfully');

            var image = docker.getImage(app.manifest.dockerImage);

            image.inspect(function (err, data) {
                if (err) return callback(new Error('Error inspecting image:' + err.message));
                if (!data || !data.Config) return callback(new Error('Missing Config in image:' + JSON.stringify(data, null, 4)));
                if (!data.Config.Entrypoint && !data.Config.Cmd) return callback(new Error('Only images with entry point are allowed'));

                debugApp(app, 'This image exposes ports: %j', data.Config.ExposedPorts);

                callback(null);
            });
        });

        stream.on('error', function (error) {
            debugApp(app, 'pullImage error : %j', error);

            callback(error);
        });
    });
}

function downloadImage(app, callback) {
    debugApp(app, 'downloadImage %s', app.manifest.dockerImage);

    var attempt = 1;

    async.retry({ times: 5, interval: 15000 }, function (retryCallback) {
        debugApp(app, 'Downloading image. attempt: %s', attempt++);

        pullImage(app, function (error) {
            if (error) console.error(error);

            retryCallback(error);
        });
    }, callback);
}

function createContainer(app, env, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(util.isArray(env));
    assert.strictEqual(typeof callback, 'function');

    var docker = exports.connection;

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

    for (var e in app.portBindings) {
        var hostPort = app.portBindings[e];
        var containerPort = manifest.tcpPorts[e].containerPort || hostPort;

        exposedPorts[containerPort + '/tcp'] = {};
        env.push(e + '=' + hostPort);

        dockerPortBindings[containerPort + '/tcp'] = [ { HostIp: '0.0.0.0', HostPort: hostPort + '' } ];
    }

    var memoryLimit = manifest.memoryLimit || 1024 * 1024 * 200; // 200mb by default

    var containerOptions = {
        name: app.id,
        Hostname: config.appFqdn(app.location),
        Tty: true,
        Image: app.manifest.dockerImage,
        Cmd: null,
        Env: stdEnv.concat(env),
        ExposedPorts: exposedPorts,
        Volumes: { // see also ReadonlyRootfs
            '/tmp': {},
            '/run': {}
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
        }
    };

    // older versions wanted a writable /var/log
    if (semver.lte(targetBoxVersion(app.manifest), '0.0.71')) containerOptions.Volumes['/var/log'] = {};

    debugApp(app, 'Creating container for %s with options: %j', app.manifest.dockerImage, containerOptions);

    docker.createContainer(containerOptions, callback);
}

function startContainer(app, callback) {
    var docker = exports.connection;

    var container = docker.getContainer(app.containerId);
    debugApp(app, 'Starting container %s', container.id);

    container.start(function (error) {
        if (error && error.statusCode !== 304) return callback(new Error('Error starting container:' + error));

        return callback(null);
    });
}

function stopContainer(app, callback) {
    if (!app.containerId) {
        debugApp(app, 'No previous container to stop');
        return callback();
    }

    var docker = exports.connection;
    var container = docker.getContainer(app.containerId);
    debugApp(app, 'Stopping container %s', container.id);

    var options = {
        t: 10 // wait for 10 seconds before killing it
    };

    container.stop(options, function (error) {
        if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error stopping container:' + error));

        debugApp(app, 'Waiting for container ' + container.id);

        container.wait(function (error, data) {
            if (error && (error.statusCode !== 304 && error.statusCode !== 404)) return callback(new Error('Error waiting on container:' + error));

            debugApp(app, 'Container stopped with status code [%s]', data ? String(data.StatusCode) : '');

            return callback(null);
        });
    });
}

function deleteContainer(app, callback) {
    if (app.containerId === null) return callback(null);

    var docker = exports.connection;
    var container = docker.getContainer(app.containerId);

    var removeOptions = {
        force: true, // kill container if it's running
        v: true // removes volumes associated with the container (but not host mounts)
    };

    container.remove(removeOptions, function (error) {
        if (error && error.statusCode === 404) return callback(null);

        if (error) debugApp(app, 'Error removing container', error);
        callback(error);
    });
}

function deleteImage(app, manifest, callback) {
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

            if (error) debugApp(app, 'Error removing image', error);

            callback(error);
        });
    });
}
