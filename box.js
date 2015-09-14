#!/usr/bin/env node

'use strict';

require('supererror')({ splatchError: true });

var server = require('./src/server.js'),
    ldap = require('./src/ldap.js'),
    config = require('./src/config.js');

console.log();
console.log('==========================================');
console.log(' Cloudron will use the following settings ');
console.log('==========================================');
console.log();
console.log(' Environment:                    ', config.CLOUDRON ? 'CLOUDRON' : 'TEST');
console.log(' Version:                        ', config.version());
console.log(' Admin Origin:                   ', config.adminOrigin());
console.log(' Appstore token:                 ', config.token());
console.log(' Appstore API server origin:     ', config.apiServerOrigin());
console.log(' Appstore Web server origin:     ', config.webServerOrigin());
console.log();
console.log('==========================================');
console.log();

server.start(function (err) {
    if (err) {
        console.error('Error starting server', err);
        process.exit(1);
    }

    console.log('Server listening on port ' + config.get('port'));

    ldap.start(function (error) {
        if (error) {
            console.error('Error LDAP starting server', err);
            process.exit(1);
        }

        console.log('LDAP server listen on port ' + config.get('ldapPort'));
    });
});

var NOOP_CALLBACK = function () { };

process.on('SIGINT', function () {
    server.stop(NOOP_CALLBACK);
    setTimeout(process.exit.bind(process), 3000);
});

process.on('SIGTERM', function () {
    server.stop(NOOP_CALLBACK);
    setTimeout(process.exit.bind(process), 3000);
});

