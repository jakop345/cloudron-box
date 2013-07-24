#!/usr/bin/env node

'use strict';

var dirIndex = require('../lib/dirindex'),
    optimist = require('optimist'),
    express = require('express'),
    util = require('util'),
    http = require('http'),
    HttpError = require('./httperror'),
    path = require('path'),
    fs = require('fs'),
    mkdirp = require('mkdirp');

var argv = optimist.usage('Usage: $0 --root <directory>')
    .alias('h', 'help')
    .describe('h', 'Show this help.')
    .alias('r', 'root')
    .demand('r')
    .describe('r', 'Sync directory root')
    .string('r')
    .alias('i', 'index')
    .describe('i', 'Directory index file')
    .string('i')
    .alias('p', 'port')
    .describe('p', 'Server port')
    .argv;


var indexFileName = argv.i || 'index.json';
var port = argv.p || 3000;
var root = path.resolve(argv.r);
var index = new dirIndex.DirIndex();

console.log('[II] Start server using root \'' + root + '\' on port \'' + port + '\'');
console.log('[II] Loading index...');

index.update(root, function () {
    console.log(index.entryList);
});

var app = express();
var multipart = express.multipart({ uploadDir: process.cwd(), keepExtensions: true, maxFieldsSize: 2 * 1024 * 1024 }); // multipart/form-data

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
    app.use(express.logger({ format: 'dev', immediate: false }))
       .use(express.timeout(10000))
       .use(multipart)
       .use(app.router)
       .use(clientErrorHandler)
       .use(serverErrorHandler);
});

// routes controlled by app.routes
app.get('/dirIndex', function (req, res, next) {
    res.send(index.json());
});

app.get('/file/:filename', function (req, res, next) {
    var absoluteFilePath = path.join(root, req.params.filename);

    fs.exists(absoluteFilePath, function (exists) {
        if (!exists) return next(new HttpError(404));

        res.sendfile(absoluteFilePath);
    });
});

app.post('/file', function (req, res, next) {
    if (!req.body.data) return next(new HttpError(400, 'data field missing'));
    var data;

    try {
        data = JSON.parse(req.body.data);
    } catch (e) {
        return next(new HttpError(400, 'cannot parse data field:' + e.message));
    }

    if (!data.filename) return next(new HttpError(400, 'filename not specified'));
    if (!data.action) return next(new HttpError(400, 'action not specified'));

    var entry = index.entry(data.filename);
    var absoluteFilePath = path.join(root, data.filename);

    console.log('Processing ', data);

    if (data.action === 'add') {
        if (!req.files.file) return next(new HttpError(400, 'file not provided'));
        if (entry) return next(new HttpError(409, 'File already exists'));

        // make sure the folder exists
        mkdirp(path.dirname(absoluteFilePath), function (error) {
            fs.rename(req.files.file.path, absoluteFilePath, function (err) {
                if (err) return next(new HttpError(500, err.toString()));
                index.addEntry(root, data.filename, function () { res.send('OK'); });
            });
        });
    } else if (data.action === 'remove') {
        if (!entry) return next(new HttpError(404, 'File does not exist'));
        fs.unlink(root + '/' + data.filename, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            index.removeEntry(root, data.filename, function() { res.send('OK'); });
        });
    } else if (data.action === 'update') {
        if (!entry) return next(new HttpError(404, 'File does not exist'));
        if (!req.files.file) return next(new HttpError(400, 'file not provided'));
        if (!data.mtime) return next(new HttpError(400, 'mtime not specified'));
        if (data.mtime < entry.mtime) return next(new HttpError(400, 'Outdated'));
        fs.rename(req.files.file.path, absoluteFilePath, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            index.updateEntry(root, data.filename, function() { res.send('OK'); });
        });
    } else {
        res.send(new HttpError(400, 'Unknown action'));
    }
});

app.listen(port);
