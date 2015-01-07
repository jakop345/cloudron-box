'use strict';

var appFqdn = require('./apps').appFqdn,
    appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:addons'),
    docker = require('./docker.js'),
    MemoryStream = require('memorystream'),
    util = require('util'),
    uuid = require('node-uuid');

exports = module.exports = {
    setupAddons: setupAddons,
    teardownAddons: teardownAddons,
    getEnvironment: getEnvironment,

    // exported for testing
    _allocateOAuthCredentials: allocateOAuthCredentials,
    _removeOAuthCredentials: removeOAuthCredentials
};

var KNOWN_ADDONS = {
    oauth: {
        setup: allocateOAuthCredentials,
        teardown: removeOAuthCredentials
    },
    sendmail: {
        setup: setupSendMail,
        teardown: teardownSendMail
    },
    mysql: {
        setup: setupMySql,
        teardown: teardownMySql
    },
    postgresql: {
        setup: setupPostgreSql,
        teardown: teardownPostgreSql
    },
    redis: {
        setup: setupRedis,
        teardown: teardownRedis
    }
};

function setupAddons(app, callback) {
    assert(typeof app === 'object');
    assert(!app.manifest.addons || util.isArray(app.manifest.addons));
    assert(typeof callback === 'function');

    if (!app.manifest.addons) return callback(null);

    async.eachSeries(app.manifest.addons, function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].setup(app, iteratorCallback);
    }, callback);
}

function teardownAddons(app, callback) {
    assert(typeof app === 'object');
    assert(!app.manifest.addons || util.isArray(app.manifest.addons));
    assert(typeof callback === 'function');

    if (!app.manifest.addons) return callback(null);

    async.eachSeries(app.manifest.addons, function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].teardown(app, iteratorCallback);
    }, callback);
}

function getEnvironment(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    appdb.getAddonConfigByAppId(appId, callback);
}

function allocateOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var id = uuid.v4();
    var appId = app.id;
    var clientId = 'cid-' + uuid.v4();
    var clientSecret = uuid.v4();
    var name = app.manifest.title;
    var redirectURI = 'https://' + appFqdn(app.location);
    var scope = 'profile,roleUser';

    debug('allocateOAuthCredentials: id:%s clientId:%s clientSecret:%s name:%s', id, clientId, clientSecret, name);

    clientdb.add(id, appId, clientId, clientSecret, name, redirectURI, scope, function (error) {
        if (error) return callback(error);

        var env = [
            'OAUTH_CLIENT_ID=' + clientId,
            'OAUTH_CLIENT_SECRET=' + clientSecret
        ];

        appdb.setAddonConfig(appId, 'oauth', env, callback);
    });
}

function removeOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('removeOAuthCredentials: %s', app.id);

    clientdb.delByAppId(app.id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null);
        if (error) console.error(error);

        appdb.unsetAddonConfig(app.id, 'oauth', callback);
    });
}

function setupSendMail(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var env = [
        'MAIL_SERVER=' + config.get('mailServer'),
        'MAIL_USERNAME=' + app.location,
        'MAIL_DOMAIN=' + config.fqdn()
    ];

    debug('Setting up sendmail for %s', app.id);

    appdb.setAddonConfig(app.id, 'sendmail', env, callback);
}

function teardownSendMail(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('Tearing down sendmail for %s', app.id);

    appdb.unsetAddonConfig(app.id, 'sendmail', callback);
}

function setupMySql(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('Setting up mysql for %s', app.id);

    var container = docker.getContainer('mysql');
    var cmd = [ '/addons/mysql/service.sh', 'add', config.get('addons.mysql.rootPassword'), app.id ];

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
            if (error) return callback(error);

            var stdout = new MemoryStream();
            var stderr = new MemoryStream();

            execContainer.modem.demuxStream(stream, stdout, stderr);
            stderr.on('data', function (data) { debug(data); }); // set -e output

            var chunks = [ ];
            stdout.on('data', function (chunk) { chunks.push(chunk); });

            stream.on('error', callback);
            stream.on('end', function () {
                var env = Buffer.concat(chunks).toString('utf8').split('\n').slice(0, -1); // remove trailing newline
                debug('Setting mysql addon config to %j', env);
                appdb.setAddonConfig(app.id, 'mysql', env, callback);
            });
        });
    });
}

function teardownMySql(app, callback) {
    var container = docker.getContainer('mysql');
    var cmd = [ '/addons/mysql/service.sh', 'remove', config.get('addons.mysql.rootPassword'), app.id ];

    debug('Tearing down mysql for %s', app.id);

    container.exec({ Cmd: cmd }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start({ stream: true, stdout: true, stderr: true }, function (error, stream) {
            if (error) return callback(error);

            var data = '';
            stream.on('error', callback);
            stream.on('data', function (d) { data += d.toString('utf8'); });
            stream.on('end', function () {
                appdb.unsetAddonConfig(app.id, 'mysql', callback);
            });
        });
    });
}

function setupPostgreSql(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('Setting up postgresql for %s', app.id);

    var container = docker.getContainer('postgresql');
    var cmd = [ '/addons/postgresql/service.sh', 'add', config.get('addons.postgresql.rootPassword'), app.id ];

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
            if (error) return callback(error);

            var stdout = new MemoryStream();
            var stderr = new MemoryStream();

            execContainer.modem.demuxStream(stream, stdout, stderr);
            stderr.on('data', function (data) { debug(data); }); // set -e output

            var chunks = [ ];
            stdout.on('data', function (chunk) { chunks.push(chunk); });

            stream.on('error', callback);
            stream.on('end', function () {
                var env = Buffer.concat(chunks).toString('utf8').split('\n').slice(0, -1); // remove trailing newline
                debug('Setting postgresql addon config to %j', env);
                appdb.setAddonConfig(app.id, 'postgresql', env, callback);
            });
        });
    });
}

function teardownPostgreSql(app, callback) {
    var container = docker.getContainer('postgresql');
    var cmd = [ '/addons/postgresql/service.sh', 'remove', config.get('addons.postgresql.rootPassword'), app.id ];

    debug('Tearing down postgresql for %s', app.id);

    container.exec({ Cmd: cmd }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start({ stream: true, stdout: true, stderr: true }, function (error, stream) {
            if (error) return callback(error);

            var data = '';
            stream.on('error', callback);
            stream.on('data', function (d) { data += d.toString('utf8'); });
            stream.on('end', function () {
                appdb.unsetAddonConfig(app.id, 'postgresql', callback);
            });
        });
    });
}

function setupRedis(app, callback) {
    var redisOptions = {
        name: 'redis-' + app.id,
        Hostname: appFqdn(app.location),
        Tty: true,
        Image: 'girish/redis:0.1',
        Cmd: null,
        Volumes: { },
        VolumesFrom: '',
        Env: null
    };

    docker.createContainer(redisOptions, function (error, container) {
        if (error) return callback(new Error('Error creating container:' + error));

        debug('Created redis container for %s with id %s', app.id, container.id);

        var startOptions = {
            Binds: [ ],
            PublishAllPorts: true
        };

        container.start(startOptions, function (error, data) {
            if (error && error.statusCode !== 304) return callback(new Error('Error starting container:' + error));

            var env = [ 'REDIS_URL=everything is awesome' ];
            appdb.setAddonConfig(app.id, 'postgresql', env, callback);
        });
    });
}

function teardownRedis(app, callback) {
   var container = docker.getContainer('redis-' + app.id);

   var removeOptions = {
       force: true, // kill container if it's running
       v: false // removes volumes associated with the container
   };

   container.remove(removeOptions, function (error) {
       if (error && error.statusCode === 404) return updateApp(app, { containerId: null }, callback);
       if (error) console.error('Error removing container', error);

       callback(error);
   });
}

