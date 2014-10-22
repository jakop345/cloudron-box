#!/usr/bin/env node

'use strict';

process.env.NODE_ENV = 'test';

require('supererror');

var Server = require('../../server.js'),
    user = require('../../user.js'),
    config = require('../../../config.js'),
    clientdb = require('../../clientdb.js'),
    uuid = require('node-uuid'),
    express = require('express');

console.log();
console.log('==========================================');
console.log(' Cloudron will use the following settings ');
console.log('==========================================');
console.log();
console.log(' Cloudron config:                ', config.cloudronConfigFile);
console.log(' Port:                           ', config.port);
console.log(' Admin Origin:                   ', config.adminOrigin);
console.log(' Appstore token:                 ', config.token);
console.log(' Appstore server origin:         ', config.appServerUrl);
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

    user.create('admin', 'admin', 'test@test.com', true /* admin */, function (error) {
        if (error) return console.error(error);

        user.create('user', 'user', 'test@test.com', false /* admin */, function (error) {
            if (error) return console.error(error);

            clientdb.add(uuid.v4(),'adminapp', 'cid-admin-app', 'unused', 'TestAdminApp', 'http://localhost:8000', 'profile,roleAdmin', function (error) {
                if (error) return console.error(error);

                clientdb.add(uuid.v4(),'app', 'cid-app', 'unused', 'TestApp', 'http://localhost:8000', 'profile,roleUser', function (error) {
                    if (error) return console.error(error);
                });
            });
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
