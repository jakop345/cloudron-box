#!/usr/bin/env node

'use strict';

var dirIndex = require('../lib/dirindex'),
    optimist = require('optimist'),
    express = require('express'),
    util = require('util'),
    http = require('http'),
    HttpError = require('./httperror'),
    fs = require('fs');

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

console.log('[II] Start server using root', argv.r);
console.log('[II] Loading index...');

var indexFileName = argv.i || 'index.json';
var port = argv.p || 3000;
var root = argv.r;
var index = new dirIndex.DirIndex();
index.update(root, function () { });

var app = express();
var multipart = express.multipart({ keepExtensions: true, maxFieldsSize: 2 * 1024 * 1024 }); // multipart/form-data

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
    if (!req.files.file) return next(new HttpError(400, 'file not provided'));

    var entry = index.entry(data.filename);

    console.log('Processing ', data, req.files.file.path);

    if (data.action === 'add') {
        if (entry) return next(new HttpError(409, 'File already exists'));
        fs.rename(req.files.file.path, root + '/' + data.filename, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            index.addEntry(data.filename);
            res.send('OK');
        });
    } else if (data.action === 'remove') {
        if (entry) return next(new HttpError(404, 'File does not exist'));
        fs.unlink(root + '/' + data.filename, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            index.removeEntry(data.filename);
            res.send('OK');
        });
    } else if (data.action === 'update') {
        if (!data.mtime) return next(new HttpError(400, 'mtime not specified'));
        fs.rename(req.files.file.path, root + '/' + data.filename, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            index.updateEntry(data.filename);
            res.send('OK');
        });
    } else {
        res.send(new HttpError(400, 'Unknown action'));
    }
});

app.listen(port);
