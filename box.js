#!/usr/bin/env node

'use strict';

require('supererror')({ splatchError: true });

// remove timestamp from debug() based output
require('debug').formatArgs = function formatArgs() {
    arguments[0] = this.namespace + ' ' + arguments[0];
    return arguments;
};

var appHealthMonitor = require('./src/apphealthmonitor.js'),
    async = require('async'),
    config = require('./src/config.js'),
    ldap = require('./src/ldap.js'),
    simpleauth = require('./src/simpleauth.js'),
    oauthproxy = require('./src/oauthproxy.js'),
    server = require('./src/server.js');

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

async.series([
    server.start,
    ldap.start,
    simpleauth.start,
    appHealthMonitor.start,
    oauthproxy.start
], function (error) {
    if (error) {
        console.error('Error starting server', error);
        process.exit(1);
    }
});

var NOOP_CALLBACK = function () { };

process.on('SIGINT', function () {
    server.stop(NOOP_CALLBACK);
    ldap.stop(NOOP_CALLBACK);
    simpleauth.stop(NOOP_CALLBACK);
    oauthproxy.stop(NOOP_CALLBACK);
    setTimeout(process.exit.bind(process), 3000);
});

process.on('SIGTERM', function () {
    server.stop(NOOP_CALLBACK);
    ldap.stop(NOOP_CALLBACK);
    simpleauth.stop(NOOP_CALLBACK);
    oauthproxy.stop(NOOP_CALLBACK);
    setTimeout(process.exit.bind(process), 3000);
});
