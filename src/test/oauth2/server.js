#!/usr/bin/env node

'use strict';

process.env.NODE_ENV = 'test';

require('supererror');

var Server = require('../../server.js'),
    user = require('../../user.js'),
    config = require('../../../config.js'),
    clientdb = require('../../clientdb.js'),
    express = require('express');

console.log();
console.log('==========================================');
console.log(' Cloudron will use the following settings ');
console.log('==========================================');
console.log();
console.log(' Cloudron config:                ', config.cloudronConfigFile);
console.log(' Port:                           ', config.port);
console.log(' Admin Origin:                   ', config.adminOrigin);
console.log(' Volume data root dir:           ', config.dataRoot);
console.log(' Volume config root dir:         ', config.configRoot);
console.log(' Volume mount root dir:          ', config.mountRoot);
console.log(' Appstore token:                 ', config.token);
console.log(' Appstore server origin:         ', config.appServerUrl);
console.log(' NGINX config root dir:          ', config.nginxAppConfigDir);
console.log(' Apps config root dir:           ', config.appDataRoot);
console.log();
console.log('==========================================');
console.log();

var server = new Server();
server.start(function (err) {
    if (err) {
        console.error('Error starting server', err);
        process.exit(1);
    }

    console.log('Server listening on port ' + config.port);

    user.create('test', 'test', 'test@test.com', true /* admin */, function (error) {
        if (error) return console.error(error);

        clientdb.add('app', 'cid-app', 'unused', 'TestApp', 'http://localhost:5454', function (error) {
            if (error) return console.error(error);
        });
    });
});

var NOOP_CALLBACK = function () { };

process.on('SIGINT', function () { server.stop(NOOP_CALLBACK); });
process.on('SIGTERM', function () { server.stop(NOOP_CALLBACK); });

var app = express();
app.use(express.static(__dirname));
app.use(express.static(__dirname + '/../../../webadmin'));

app.listen(8000, '0.0.0.0');
