#!/usr/bin/env node

'use strict';

// Put express and various other middleware in production mode
if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'production';
}

require('supererror');

var Server = require('./src/server.js'),
    config = require('./config.js');

console.log();
console.log('==========================================');
console.log(' Cloudron will use the following settings ');
console.log('==========================================');
console.log();
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

    server.announce(function (error) {
        if (error) console.error('Unable to announce box with appstore.', error);
        else console.log('Successfully announce box with appstore');
    });
});

var NOOP_CALLBACK = function () { };

process.on('SIGINT', function () { server.stop(NOOP_CALLBACK); });
process.on('SIGTERM', function () { server.stop(NOOP_CALLBACK); });
