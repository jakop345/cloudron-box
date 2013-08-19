#!/usr/bin/env node

'use strict';

var optimist = require('optimist'),
    express = require('express'),
    util = require('util'),
    http = require('http'),
    HttpError = require('./httperror'),
    path = require('path'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    db = require('./database'),
    sync = require('./sync'),
    routes = require('./routes'),
    repo = require('./repo'),
    debug = require('debug');

var argv = optimist.usage('Usage: $0 --dataRoot <directory>')
    .alias('h', 'help')
    .describe('h', 'Show this help.')

    .alias('d', 'dataRoot')
    .default('d', '.data')
    .describe('d', 'Volume data storage directory.')
    .string('d')

    .alias('m', 'mountRoot')
    .default('m', '.mount')
    .describe('m', 'Volume mount point directory.')
    .string('m')

    .alias('c', 'configRoot')
    .default('c', '.config')
    .describe('c', 'Server config root directory for storing user db and meta data.')
    .string('c')

    .alias('p', 'port')
    .describe('p', 'Server port')
    .argv;

var app = express();

// Error handlers. These are called until one of them sends headers
function clientErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode; // connect/express or our app
    if (status >= 400 && status <= 499) {
        util.debug(http.STATUS_CODES[status] + ' : ' + err.message);
        res.send(status, JSON.stringify({ status: http.STATUS_CODES[status], message: err.message }));
    } else {
        next(err);
    }
}

function serverErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode || 500;
    res.send(status, http.STATUS_CODES[status] + ' : ' + err.message);
    util.debug(http.STATUS_CODES[status] + ' : ' + err.message);
    util.debug(err.stack);
}


app.configure(function () {
    var json = express.json({ strict: true, limit: 2000 }), // application/json
        urlencoded = express.urlencoded({ limit: 2000 }), // application/x-www-form-urlencoded
        multipart = express.multipart({ uploadDir: process.cwd(), keepExtensions: true, maxFieldsSize: 2 * 1024 * 1024 }); // multipart/form-data

    app.use(express.logger({ format: 'dev', immediate: false }))
       .use(express.timeout(10000))
       .use(routes.user.firstTimeCheck)
       .use('/', express.static(__dirname + '/webadmin')) // use '/' for now so cookie is not restricted to '/webadmin'
       .use(json)
       .use(urlencoded)
       .use(multipart)
       .use(express.cookieParser())
       .use(express.favicon(__dirname + "/webadmin/assets/favicon.ico"))
       // API calls that do not require authorization
       .use('/api/v1/createadmin', routes.user.createAdmin) // ## FIXME: allow this before auth for now
       .use(routes.user.authenticate)
       .use(app.router)
       .use(clientErrorHandler)
       .use(serverErrorHandler);

    // routes controlled by app.router
    app.post('/api/v1/token', routes.user.createToken);
    app.get('/api/v1/logout', routes.user.logout);
    app.get('/api/v1/userInfo', routes.user.userInfo);

    app.get('/api/v1/file/dirIndex', routes.file.listing);
    app.get('/file/:filename', routes.file.read);
    app.post('/file', routes.file.update);

    app.get('/api/v1/volume/*/list/', routes.volume.listFiles);
    app.get('/api/v1/volume/*/list/*', routes.volume.listFiles);
    app.get('/api/v1/volume/list', routes.volume.listVolumes);
    app.post('/api/v1/volume/create', routes.volume.createVolume);
    app.post('/api/v1/volume/*/delete', routes.volume.deleteVolume);
    app.post('/api/v1/volume/*/mount', routes.volume.mount);
    app.post('/api/v1/volume/*/unmount', routes.volume.unmount);
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
    mkdirp(config.dataRoot);
    mkdirp(config.configRoot);
    mkdirp(config.mountRoot);

    if (!db.initialize(config)) {
        return callback(new Error('Error initializing database'));
    }

    // sync.initialize(config);
    // routes.file.initialize(config, sync);
    routes.volume.initialize(config);

    // repo.initialize(config, callback);
    callback();
}

function listen(next) {
    next = next || function () { };

    http.createServer(app).listen(app.get('port'), function () {
        console.log('Server listening on port ' + app.get('port') + ' in ' + app.get('env') + ' mode');
        next();
    });
}

if (require.main === module) {
    initialize(function (err) {
        if (err) {
            console.error('error initializing', err);
            process.exit(1);
        }
        listen();
    });
}

