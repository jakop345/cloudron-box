#!/usr/bin/env node

'use strict';

var optimist = require('optimist'),
    express = require('express'),
    http = require('http'),
    HttpError = require('./api/httperror'),
    path = require('path'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    db = require('./api/database.js'),
    routes = require('./api/routes'),
    debug = require('debug')('server:server'),
    crypto = require('crypto'),
    os = require('os'),
    polo = require('polo'),
    assert = require('assert'),
    user = require('./api/user.js'),
    pkg = require('./package.json');

exports = module.exports = {
    start: start,
    stop: stop,
    VERSION: pkg.version
};

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var baseDir = path.join(getUserHomeDir(), '.yellowtent');

var argv = optimist.usage('Usage: $0 --dataRoot <directory>')
    .alias('h', 'help')
    .describe('h', 'Show this help.')

    .alias('d', 'dataRoot')
    .default('d', path.join(baseDir, 'data'))
    .describe('d', 'Volume data storage directory.')
    .string('d')

    .alias('m', 'mountRoot')
    .default('m', path.join(baseDir, 'mount'))
    .describe('m', 'Volume mount point directory.')
    .string('m')

    .alias('s', 'silent')
    .default('s', false)
    .describe('s', 'Suppress console output for non errors.')
    .boolean('s')

    .alias('c', 'configRoot')
    .default('c', path.join(baseDir, 'config'))
    .describe('c', 'Server config root directory for storing user db and meta data.')
    .string('c')

    .alias('p', 'port')
    .describe('p', 'Server port')
    .argv;

// print help and die if requested
if (argv.h) {
    optimist.showHelp();
    process.exit(0);
}

// Error handlers. These are called until one of them sends headers
function clientErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode; // connect/express or our app
    if (status >= 400 && status <= 499) {
        res.send(status, { status: http.STATUS_CODES[status], message: err.message });
        debug(http.STATUS_CODES[status] + ' : ' + err.message);
        debug(err.stack);
    } else {
        next(err);
    }
}

function serverErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode || 500;
    res.send(status, { status: http.STATUS_CODES[status], message: err.message });
    console.error(http.STATUS_CODES[status] + ' : ' + err.message);
    console.error(err.stack);
}

function getVersion(req, res, next) {
    if (req.method !== 'GET') return next(new HttpError(405, 'Only GET supported'));
    res.send({ version: exports.VERSION });
}

/*
    Step which makes the route require a password in the body besides a token.
    Needed for mounting/deletion/creation of volumes.
*/
function requirePassword(req, res, next) {
    if (!req.body.password) {
        return next(new HttpError(400, 'API call requires the users password.'));
    }

    // req.user.username is either set via the auth user/pw tuple or the auth token
    user.verify(req.user.username, req.body.password, function (error, result) {
        if (error) {
            return next(new HttpError(401, 'Wrong password entered'));
        }

        next();
    });
}

function loadMiddleware() {
    var middleware = { };
    fs.readdirSync(__dirname + '/middleware').forEach(function (filename) {
        if (!/\.js$/.test(filename)) return;
        var name = path.basename(filename, '.js');
        function load() { return require('./middleware/' + name); }
        middleware.__defineGetter__(name, load);
    });
    return middleware;
}

function initialize(config, callback) {
    var middleware = loadMiddleware();
    var app = express();

    app.configure(function () {
        var REQUEST_LIMIT='10mb';

        var json = express.json({ strict: true, limit: REQUEST_LIMIT }), // application/json
            urlencoded = express.urlencoded({ limit: REQUEST_LIMIT }); // application/x-www-form-urlencoded

        if (!config.silent) {
            app.use(express.logger({ format: 'dev', immediate: false }));
        }

        app.use(express.timeout(10000))
           .use('/', express.static(__dirname + '/webadmin')) // use '/' for now so cookie is not restricted to '/webadmin'
           .use(json)
           .use(urlencoded)
           .use(express.cookieParser())
           .use(express.favicon(__dirname + "/assets/favicon.ico"))
           // API calls that do not require authorization
           .use(middleware.contentType('application/json'))
           .use('/api/v1/version', getVersion)
           .use('/api/v1/firsttime', routes.user.firstTime)
           .use('/api/v1/createadmin', routes.user.createAdmin) // ## FIXME: allow this before auth for now
           .use(routes.user.authenticate)
           .use(app.router)
           .use(clientErrorHandler)
           .use(serverErrorHandler);

        // routes controlled by app.router
        app.post('/api/v1/token', routes.user.createToken);
        app.get('/api/v1/logout', routes.user.logout);
        app.post('/api/v1/user/create', routes.user.create);
        app.post('/api/v1/user/remove', routes.user.remove);
        app.get('/api/v1/user/info', routes.user.info);

        app.param('volume', routes.volume.attachVolume);

        app.post('/api/v1/sync/:volume/diff', routes.volume.requireMountedVolume, routes.sync.diff);
        app.post('/api/v1/sync/:volume/delta', routes.volume.requireMountedVolume, routes.sync.delta);

        app.get('/api/v1/revisions/:volume/*', routes.volume.requireMountedVolume, routes.file.revisions);
        app.get('/api/v1/file/:volume/*', routes.volume.requireMountedVolume, routes.file.read);
        app.get('/api/v1/metadata/:volume/*', routes.volume.requireMountedVolume, routes.file.metadata);
        app.put('/api/v1/file/:volume/*', routes.volume.requireMountedVolume, routes.file.multipart, routes.file.putFile);

        app.post('/api/v1/fileops/:volume/copy', routes.volume.requireMountedVolume, express.json({ strict: true }), routes.fileops.copy);
        app.post('/api/v1/fileops/:volume/move', routes.volume.requireMountedVolume, express.json({ strict: true }), routes.fileops.move);
        app.post('/api/v1/fileops/:volume/delete', routes.volume.requireMountedVolume, express.json({ strict: true }), routes.fileops.remove);

        app.get('/api/v1/volume/:volume/list/', routes.volume.requireMountedVolume, routes.volume.listFiles);
        app.get('/api/v1/volume/:volume/list/*', routes.volume.requireMountedVolume, routes.volume.listFiles);
        app.get('/api/v1/volume/list', routes.volume.listVolumes);
        app.post('/api/v1/volume/create', requirePassword, routes.volume.createVolume);
        app.post('/api/v1/volume/:volume/delete', requirePassword, routes.volume.deleteVolume);
        app.post('/api/v1/volume/:volume/mount', requirePassword, routes.volume.mount);
        app.post('/api/v1/volume/:volume/unmount', requirePassword, routes.volume.unmount);
        app.get('/api/v1/volume/:volume/ismounted', routes.volume.isMounted);
    });

    app.set('port', config.port);

    if (!config.silent) {
        console.log('Server listening on port ' + app.get('port'));
        console.log('Using data root:', config.dataRoot);
        console.log('Using config root:', config.configRoot);
        console.log('Using mount root:', config.mountRoot);
    }

    // ensure data/config/mount paths
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);

    if (!db.initialize(config)) {
        return callback(new Error('Error initializing database'));
    }

    routes.sync.initialize(config);
    routes.volume.initialize(config);

    callback(null, app);
}

function listen(app, callback) {
    app.httpServer = http.createServer(app);

    function callbackWrapper(error) {
        if (callback) {
            callback(error);
            callback = undefined;
        } else {
            console.error('Try to call back twice', error);
        }
    }

    app.httpServer.listen(app.get('port'), function (err) {
        if (err) return callbackWrapper(err);
        callbackWrapper();
    });

    app.httpServer.on('error', function (err) {
        callbackWrapper(err);
    });
}

function announce(app, callback) {
    var services = polo();

    services.put({
        name: 'yellowtent',
        port: app.get('port')
    });

    services.on('error', function (error) {
        console.error('Unable to announce the device.', error);
    });

    callback();
}

function start(config, callback) {
    assert(typeof config === 'object');
    assert(typeof callback === 'function');

    initialize(config, function (err, app) {
        if (err) return callback(err);

        listen(app, function (err) {
            if (err) return callback(err);

            announce(app, function (err) {
                if (err) return callback(err);

                callback(null, app);
            });
        });
    });
}

function stop(app, callback) {
    // Any other way to check if app is an object we expect?
    assert(app && app.httpServer);
    assert(typeof callback === 'function');

    if (!app.httpServer) {
        return callback();
    }

    app.httpServer.close(function () {
        app.httpServer.unref();
        // TODO should delete the app variable
        app = undefined;

        callback();
    });
}

// main entry point when running standalone
// TODO Maybe this should go into a new 'executeable' file - Johannes
if (require.main === module) {
    var config = {
        port: argv.p || 3000,
        dataRoot: path.resolve(argv.d),
        configRoot: path.resolve(argv.c),
        mountRoot: path.resolve(argv.m),
        silent: argv.s
    };

    start(config, function (err) {
        if (err) {
            console.error('Error starting server', err);
            process.exit(1);
        }
    });
}
