/* jslint node:true */

'use strict';

var appdb = require('./appdb.js'),
    assert = require('assert'),
    child_process = require('child_process'),
    config = require('../config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apps'),
    Docker = require('dockerode'),
    fs = require('fs'),
    os = require('os'),
    paths = require('./paths.js'),
    split = require('split'),
    stream = require('stream'),
    util = require('util');

exports = module.exports = {
    AppsError: AppsError,

    initialize: initialize,
    uninitialize: uninitialize,
    get: get,
    getBySubdomain: getBySubdomain,
    getAll: getAll,
    install: install,
    configure: configure,
    uninstall: uninstall,
    update: update,

    getLogStream: getLogStream,
    getLogs: getLogs,

    start: start,
    stop: stop,

    appFqdn: appFqdn,

    // exported for testing
    _validateSubdomain: validateSubdomain,
    _validatePortBindings: validatePortBindings
};

var gTasks = { },
    gAppHealthTask = null,
    gDocker = null;

function initialize() {
    if (process.env.NODE_ENV === 'test') {
        gDocker = new Docker({ host: 'http://localhost', port: 5687 });
    } else if (os.platform() === 'linux') {
        gDocker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        gDocker = new Docker({ host: 'http://localhost', port: 2375 });
    }

    gAppHealthTask = child_process.fork(__dirname + '/apphealthtask.js');

    resume(); // FIXME: potential race here since resume is async
}

function startTask(appId) {
    assert(!(appId in gTasks));

    gTasks[appId] = child_process.fork(__dirname + '/apptask.js', [ appId ]);
    gTasks[appId].once('exit', function (code, signal) {
        debug('Task completed :' + appId);
        delete gTasks[appId];
    });
}

function stopTask(appId) {
    if (gTasks[appId]) {
        debug('Killing existing task : ' + gTasks[appId].pid);
        gTasks[appId].kill();
        delete gTasks[appId];
    }
}

// resume install and uninstalls
function resume() {
    appdb.getAll(function (error, apps) {
        if (error) throw error;
        apps.forEach(function (app) {
            debug('Creating process for ' + app.id + ' with state ' + app.installationState);
            startTask(app.id);
        });
    });
}

function uninitialize() {
    if (gAppHealthTask) {
        gAppHealthTask.kill();
        gAppHealthTask = null;
    }

    for (var appId in gTasks) {
        stopTask(appId);
    }
}

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AppsError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.internalError = errorOrMessage;
    }
}
util.inherits(AppsError, Error);
AppsError.INTERNAL_ERROR = 'Internal Error';
AppsError.ALREADY_EXISTS = 'Already Exists';
AppsError.NOT_FOUND = 'Not Found';
AppsError.BAD_FIELD = 'Bad Field';
AppsError.BAD_STATE = 'Bad State';

function appFqdn(location) {
    return location + '-' + config.fqdn();
}

// http://stackoverflow.com/questions/7930751/regexp-for-subdomain
function validateSubdomain(subdomain, fqdn) {
    // TODO: convert to lowerCase
    var RESERVED_SUBDOMAINS = [ 'admin', '_dmarc', '_domainkey' ];

    if (RESERVED_SUBDOMAINS.indexOf(subdomain) !== -1) return new Error(subdomain + ' location is reserved');

    if (subdomain.length > 63) return new Error('Subdomain length cannot be greater than 63');
    if (subdomain.match(/^[A-Za-z0-9-]+$/) === null) return new Error('Subdomain can only contain alphanumerics and hyphen');
    if (subdomain[0] === '-' || subdomain[subdomain.length-1] === '-') return new Error('Subdomain cannot start or end with hyphen');

    if (subdomain.length + 1 /* dot */ + fqdn.length > 255) return new Error('Domain length exceeds 255 characters');

    return null;
}

// validate the port bindings
function validatePortBindings(portBindings) {
    // keep the public ports in sync with firewall rules in sripts/initializeBaseUbuntuImage.sh
    var RESERVED_PORTS = [
        22, /* ssh */
        25, /* smtp */
        53, /* dns */
        80, /* http */
        443, /* https */
        2003, /* graphite */
        2004, /* graphite */
        3000, /* app server */
        8000 /* graphite */
    ];

    for (var containerPort in portBindings) {
        var containerPortInt = parseInt(containerPort, 10);
        if (isNaN(containerPortInt) || containerPortInt <= 0 || containerPortInt > 65535) {
            return new Error(containerPort + ' is not a valid port');
        }

        var hostPortInt = parseInt(portBindings[containerPort], 10);
        if (isNaN(hostPortInt) || hostPortInt <= 1024 || hostPortInt > 65535) {
            return new Error(portBindings[containerPort] + ' is not a valid port');
        }

        if (RESERVED_PORTS.indexOf(hostPortInt) !== -1) return new Error(hostPortInt + ' is reserved');
    }

    return null;
}

function getIconURLSync(app) {
    var iconPath = paths.APPICONS_DIR + '/' + app.id + '.png';
    if (fs.existsSync(iconPath)) {
        return '/api/v1/app/' + app.id + '/icon';
    } else {
        return null;
    }
}

function get(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.icon = getIconURLSync(app);
        app.fqdn = appFqdn(app.location);

        callback(null, app);
    });
}

function getBySubdomain(subdomain, callback) {
    assert(typeof subdomain === 'string');
    assert(typeof callback === 'function');

    appdb.getBySubdomain(subdomain, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.icon = getIconURLSync(app);
        app.fqdn = appFqdn(app.location);

        callback(null, app);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    appdb.getAll(function (error, apps) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        apps.forEach(function (app) {
            app.icon = getIconURLSync(app);
            app.fqdn = appFqdn(app.location);
        });

        callback(null, apps);
    });
}

function install(appId, appStoreId, username, password, location, portBindings, restrictAccessTo, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof location === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof restrictAccessTo === 'string');
    assert(typeof callback === 'function');

    var error = validateSubdomain(location, config.fqdn());
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validatePortBindings(portBindings);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    debug('Will install app with id : ' + appId);

    appdb.add(appId, appStoreId, location, portBindings, restrictAccessTo, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError(AppsError.ALREADY_EXISTS));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function configure(appId, username, password, location, portBindings, restrictAccessTo, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof restrictAccessTo === 'string');
    assert(typeof callback === 'function');

    var error = location ? validateSubdomain(location, config.fqdn()) : null;
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = portBindings ? validatePortBindings(portBindings) : null;
    if (error) return callback(error);

    var values = { };
    if (location) values.location = location;
    values.portBindings = portBindings;
    values.restrictAccessTo = restrictAccessTo;

    debug('Will install app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_CONFIGURE, values, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function update(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will update app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UPDATE, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function getLogStream(appId, options, callback) {
    assert(typeof appId === 'string');
    assert(typeof options === 'object');
    assert(typeof callback === 'function');

    debug('Getting logs for %s', appId);
    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, 'App not installed'));

        var container = gDocker.getContainer(app.containerId);
        // note: cannot access docker file directly because it needs root access
        container.logs({ stdout: true, stderr: true, follow: true, timestamps: true, tail: 'all' }, function (error, logStream) {
            if (error && error.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            var lineCount = 0;
            var skipLinesStream = split(function mapper(line) {
                if (++lineCount < options.fromLine) return undefined;
                return JSON.stringify({ lineNumber: lineCount, log: line });
            });
            skipLinesStream.close = logStream.req.abort;
            logStream.pipe(skipLinesStream);
            return callback(null, skipLinesStream);
        });
    });
}

function getLogs(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Getting logs for %s', appId);
    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, 'App not installed'));

        var container = gDocker.getContainer(app.containerId);
        // note: cannot access docker file directly because it needs root access
        container.logs({ stdout: true, stderr: true, follow: false, timestamps: true, tail: 'all' }, function (error, logStream) {
            if (error && error.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            return callback(null, logStream);
        });
    });
}

function uninstall(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will uninstall app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UNINSTALL, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function start(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will start app with id:%s', appId);

    appdb.setRunCommand(appId, appdb.RSTATE_PENDING_START, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function stop(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will stop app with id:%s', appId);

    appdb.setRunCommand(appId, appdb.RSTATE_PENDING_STOP, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

