'use strict';

var DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    debug = require('debug')('server:apps'),
    assert = require('assert'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    superagent = require('superagent'),
    EventEmitter = require('events').EventEmitter,
    async = require('async'),
    yaml = require('js-yaml'),
    Docker = require('dockerode'),
    os = require('os'),
    Writable = require('stream').Writable;

exports = module.exports = {
    AppsError: AppsError,

    initialize: initialize,
    install: install
};

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AppsError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = safe.JSON.stringify(err);
    this.code = err ? err.code : null;
    this.reason = reason || AppsError.INTERNAL_ERROR;
}
util.inherits(AppsError, Error);
AppsError.INTERNAL_ERROR = 1;
AppsError.ALREADY_EXISTS = 2;

var STATUS_PENDING = 'pending';

var appServerUrl = null, task = null;

function initialize(config) {
    appServerUrl = config.appServerUrl;
    task = new Task();
}

function install(appId, username, password, config, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof config === 'object');

    appdb.add(appId, { status: STATUS_PENDING, config: JSON.stringify(config) }, function (error) {
//        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError('Already installed or installing', AppsError.ALREADY_EXISTS));
 //       if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        debug('Will install app with id : ' + appId);

        task.refresh();

        callback(null);
    });
}

function Task() {
    this._refreshing = false;
    this._pendingRefresh = false;
    if (os.platform() === 'linux') {
        this._docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        this._docker = new Docker({ host: 'http://localhost', port: 4243 });
    }
}
util.inherits(Task, EventEmitter);

Task.prototype.downloadApp = function (manifest, callback) {
    debug('Will download app now');
    var docker = this._docker;

    docker.pull(manifest.docker_image, function (err, stream) {
        if (err) {
            debug('Error connecting to docker', err);
            return callback(err);
        }

        // https://github.com/dotcloud/docker/issues/1074 says each status message
        // is emitted as a chunk
        stream.on('data', function (chunk) {
            var data = safe.JSON.parse(chunk) || { };
            debug(JSON.stringify(data));
            if (data.status) {
                debug('Progress: ' + data.status); // progressDetail { current, total }
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
                    return callback(err);
                }
                if (!data.config.Entrypoint) {
                    debug('Only images with entry point are allowed');
                    return callback(err);
                }

                debug('This image exposes ports: ' + JSON.stringify(data.config.ExposedPorts));

                return callback(null);
            });
        });
    });
};

Task.prototype.runApp = function (manifest, config, callback) {
    var outputStream = Writable(),
        docker = this._docker;

    outputStream._write = function (chunk, enc, callback) {
        console.log('CHUNK: ' + chunk);
        callback();
    };

    var options = {
        Hostname: config.location || ''
    };

    debug('Running ' + manifest.docker_image);

    docker.run(manifest.docker_image, null /* command */, outputStream, options, function (err, data, container) {
        if (err) {
            debug('Error creating the container');
            return callback(err);
        }
        console.dir(data);
        callback(null); // change state to starting up.. and wait for homepage
    }).on('container', function (container) {
        console.log('i got the container here');
        console.dir(container);
        //   container.defaultOptions.start.Binds = ["/tmp:/tmp:rw"];
    });
};

Task.prototype.refresh = function () {
    if (this._refreshing) {
        debug('Already refreshing, marked as pending');
        this._pendingRefresh = true;
        return;
    }

    var that = this;
    this._refreshing = true;

    debug('Refreshing');

    appdb.getAll(function (error, apps) {
        if (error) {
            debug('Error reading apps table ' + error);
            return;
        }

        async.eachSeries(apps, function iterator(app, callback) {
            if (app.status === 'Installed') return;

            superagent
                .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
                .set('Accept', 'application/x-yaml')
                .end(function (error, res) {
                    if (error) {
                        debug('Error making request: ' + error.message);
                        return callback(null);
                    }
                    if (res.status !== 200) {
                        debug('Error downloading manifest:' + res.body.status + ' ' + res.body.message);
                        return callback(null);
                    }

                    var bufs = [ ];
                    res.on('data', function (d) { bufs.push(d); });
                    res.on('end', function () {
                        var rawManifest = Buffer.concat(bufs);
                        var manifest = safe(function () { return yaml.safeLoad(rawManifest.toString('utf8')); });
                        if (manifest == null) {
                            debug('Error parsing manifest: ' + safe.error);
                            return callback(null);
                        }

                       that.downloadApp(manifest, function (error) {
                            if (error) {
                                console.error('Error downloading application', error);
                                return callback(null);
                            }
                            console.log('Download app successful. running with configuration: ' + app.config);
                            that.runApp(manifest, app.config, callback);
                        });
                    });
            });
        }, function callback(err) {
            that._refreshing = false;
            if (that._pendingRefresh) process.nextTick(refresh.bind(that));
            that._pendingRefresh = false;
        });

    });
};


