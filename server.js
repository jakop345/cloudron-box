#!/usr/bin/env node

'use strict';

var optimist = require('optimist'),
    express = require('express'),
    http = require('http'),
    HttpError = require('./src/httperror'),
    path = require('path'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    db = require('./src/database.js'),
    routes = require('./src/routes'),
    debug = require('debug'),
    crypto = require('crypto'),
    os = require('os');

var app = express();

exports = module.exports = {
    start: start,
    app: app,
    VERSION: '0.0.1' // get this from package.json?
};

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var baseDir = path.join(getUserHomeDir(), '.yellowtent');

app.configure('testing', function () {
    // to make sure tests can run repeatedly, set the basedir to something random
    var tmpdirname = 'yellowtent-' + crypto.randomBytes(4).readUInt32LE(0);
    baseDir = path.join(os.tmpdir(), tmpdirname);
});


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

    .alias('c', 'configRoot')
    .default('c', path.join(baseDir, 'config'))
    .describe('c', 'Server config root directory for storing user db and meta data.')
    .string('c')

    .alias('p', 'port')
    .describe('p', 'Server port')
    .argv;

// Error handlers. These are called until one of them sends headers
function clientErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode; // connect/express or our app
    if (status >= 400 && status <= 499) {
        res.send(status, JSON.stringify({ status: http.STATUS_CODES[status], message: err.message }));
        debug(http.STATUS_CODES[status] + ' : ' + err.message);
        debug(err.stack);
    } else {
        next(err);
    }
}

function serverErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode || 500;
    res.send(status, http.STATUS_CODES[status] + ' : ' + err.message);
    console.error(http.STATUS_CODES[status] + ' : ' + err.message);
    console.error(err.stack);
}

function getVersion(req, res, next) {
    if (req.method !== 'GET') return next(new HttpError(405, 'Only GET supported'));
    res.send({ version: exports.VERSION });
}

app.configure(function () {
    var json = express.json({ strict: true, limit: 2000 }), // application/json
        urlencoded = express.urlencoded({ limit: 2000 }); // application/x-www-form-urlencoded

    if (app.get('env') != 'testing') {
        app.use(express.logger({ format: 'dev', immediate: false }))
    }

    app.use(express.timeout(10000))
       .use(routes.user.firstTimeCheck)
       .use('/', express.static(__dirname + '/webadmin')) // use '/' for now so cookie is not restricted to '/webadmin'
       .use(json)
       .use(urlencoded)
       .use(express.cookieParser())
       .use(express.favicon(__dirname + "/assets/favicon.ico"))
       // API calls that do not require authorization
       .use('/api/v1/version', getVersion)
       .use('/api/v1/createadmin', routes.user.createAdmin) // ## FIXME: allow this before auth for now
       .use(routes.user.authenticate)
       .use(app.router)
       .use(clientErrorHandler)
       .use(serverErrorHandler);

    // routes controlled by app.router
    app.post('/api/v1/token', routes.user.createToken);
    app.get('/api/v1/logout', routes.user.logout);
    app.get('/api/v1/userInfo', routes.user.userInfo);

    app.param('volume', routes.volume.attachVolume);

    app.post('/api/v1/sync/:volume/diff', routes.sync.diff);
    app.post('/api/v1/sync/:volume/delta', routes.sync.delta);

    app.get('/api/v1/revisions/:volume/*', routes.file.revisions);
    app.get('/api/v1/file/:volume/*', routes.file.read);
    app.post('/api/v1/file/:volume/*', routes.file.multipart, routes.file.update);

    app.get('/api/v1/volume/:volume/list/', routes.volume.listFiles);
    app.get('/api/v1/volume/:volume/list/*', routes.volume.listFiles);
    app.get('/api/v1/volume/list', routes.volume.listVolumes);
    app.post('/api/v1/volume/create', routes.volume.createVolume);
    app.post('/api/v1/volume/:volume/delete', routes.volume.deleteVolume);
    app.post('/api/v1/volume/:volume/mount', routes.volume.mount);
    app.post('/api/v1/volume/:volume/unmount', routes.volume.unmount);
});

function initialize(callback) {
    var config = {
        port: argv.p || 3000,
        dataRoot: path.resolve(argv.d),
        configRoot: path.resolve(argv.c),
        mountRoot: path.resolve(argv.m)
    };

    app.set('port', config.port);

    console.log('Using data root:', config.dataRoot);
    console.log('Using config root:', config.configRoot);
    console.log('Using mount root:', config.mountRoot);

    // ensure data/config/mount paths
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);

    if (!db.initialize(config)) {
        return callback(new Error('Error initializing database'));
    }

    routes.sync.initialize(config);
    routes.volume.initialize(config);

    callback();
}

function listen(callback) {
    http.createServer(app).listen(app.get('port'), function (err) {
        if (err) return callback(err);
        console.log('Server listening on port ' + app.get('port') + ' in ' + app.get('env') + ' mode');
        callback();
    });
}

function start(callback) {
    function printAndDie(msg, err) {
        console.error(msg, err);
        process.exit(1);
    }

    initialize(function (err) {
        if (err) printAndDie('Error initializing', err);
        listen(function (err) {
            if (err) printAndDie('Error listening', err);
            callback();
        });
    });
}

if (require.main === module) {
    start(function () { });
}

