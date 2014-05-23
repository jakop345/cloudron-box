/* jslint node:true */

'use strict';

var assert = require('assert'),
    Docker = require('dockerode'),
    superagent = require('superagent'),
    async = require('async'),
    yaml = require('js-yaml'),
    os = require('os'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    Writable = require('stream').Writable,
    debug = require('debug')('apptask');

exports = module.exports = {
    initialize: initialize,
    refresh: refresh
};

var appServerUrl = null, docker = null,
    refreshing = false, pendingRefresh = false;

var NOOP_CALLBACK = function (error) { };

function initialize(_appServerUrl) {
    assert(typeof _appServerUrl === 'string');

    appServerUrl = _appServerUrl;

    if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 4243 });
    }

    setInterval(refresh, 3000);
}

function downloadImage(app, callback) {
    debug('Will download app now');

    appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADING_IMAGE, statusMessage: '' }, NOOP_CALLBACK);

    var manifest = safe(function () { return yaml.safeLoad(app.manifest); });
    if (manifest === null) {
        debug('Error parsing manifest: ' + safe.error);
        appdb.update(app.id, { statusCode: appdb.STATUS_MANIFEST_ERROR, statusMessage: 'Parse error:' + safe.error }, NOOP_CALLBACK);
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
            debug(docker.modem);

            var image = docker.getImage(manifest.docker_image);
            debug(image.modem);

            image.inspect(function (err, data) {
                if (err || !data || !data.config) {
                    debug('Error inspecting image');
                    appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error inspecting image' }, NOOP_CALLBACK);
                    return callback(err);
                }
                if (!data.config.Entrypoint) {
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
        config = JSON.parse(app.config),
        manifest = yaml.safeLoad(app.manifest); // this is guaranteed not to throw since it's already been verified in downloadManifest()

    outputStream._write = function (chunk, enc, callback) {
        console.log('CHUNK: ' + chunk);
        callback();
    };

    var options = {
        Hostname: config.location || ''
    };

    debug('Running ' + manifest.docker_image);

    appdb.update(app.id, { statusCode: appdb.STATUS_STARTING_UP, statusMessage: '' }, NOOP_CALLBACK);

    var hub = docker.run(manifest.docker_image, null /* command */, outputStream, options, function (err, data, container) {
        // NOTE: this callback is called when the image finished running
        if (err) {
            debug('Error creating the container');
            appdb.update(app.id, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error creating container' }, NOOP_CALLBACK);
            return callback(err);
        }

        console.dir(data);
        appdb.update(app.id, { statusCode: appdb.STATUS_EXITED, statusMessage: '' }, callback);
    });

    hub.on('container', function (container) {
        console.dir(container);
        // container.defaultOptions.start.Binds = ["/tmp:/tmp:rw"];
        container.defaultOptions.start.PublishAllPorts = true;
    });
};

function downloadManifest(app, callback) {
    debug('Downloading manifest for :', app.id);

    appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADING_MANIFEST, statusMessage: '' }, NOOP_CALLBACK);

    superagent
        .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
        .set('Accept', 'application/x-yaml')
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

            var bufs = [ ];
            res.on('data', function (d) { bufs.push(d); });
            res.on('end', function () {
                var rawManifest = Buffer.concat(bufs);
                app.manifest = rawManifest.toString('utf8');
                debug('Downloaded application manifest: ' + app.manifest);
                appdb.update(app.id, { statusCode: appdb.STATUS_DOWNLOADED_MANIFEST, statusMessage: '', manifest: app.manifest }, callback);
            });
        });
};

function uninstall(app, callback) {
    // TODO remove from docker as well
    appdb.del(app.id, function (error) {
        callback(null);
    });
};

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
            case appdb.STATUS_INSTALLED:
                return;

            case appdb.STATUS_PENDING_INSTALL:
            case appdb.STATUS_MANIFEST_ERROR:
            case appdb.STATUS_DOWNLOAD_ERROR:
            case appdb.STATUS_DOWNLOADING_MANIFEST:
            case appdb.STATUS_IMAGE_ERROR:
                downloadManifest(app, callback);
                break;

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
                 // TODO: kill any existing instance of container. startApp()

            case appdb.STATUS_STARTED:
                 // TODO: poll for homepage.
                appdb.update(app.id, { statusCode: appdb.STATUS_RUNNING, statusMessage: '' }, callback);
                break;

            case appdb.STATUS_RUNNING:
                callback();
                break;
            }
        }, function callback(err) {
            refreshing = false;
            if (pendingRefresh) process.nextTick(refresh);
            pendingRefresh = false;
        });

    });
};
