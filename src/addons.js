'use strict';

var appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:addons'),
    docker = require('./docker.js'),
    execFile = child_process.execFile,
    generatePassword = require('password-generator'),
    MemoryStream = require('memorystream'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    util = require('util'),
    uuid = require('node-uuid'),
    vbox = require('./vbox.js'),
    _ = require('underscore');

exports = module.exports = {
    setupAddons: setupAddons,
    teardownAddons: teardownAddons,
    updateAddons: updateAddons,

    getEnvironment: getEnvironment,
    getLinksSync: getLinksSync,

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

var SUDO = '/usr/bin/sudo',
    RMAPPDIR_CMD = path.join(__dirname, 'scripts/rmappdir.sh');

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

function updateAddons(app, oldManifest, callback) {
    assert(typeof app === 'object');
    assert(typeof oldManifest === 'object');
    assert(typeof callback === 'function');

    setupAddons(app, function (error) {
        if (error) return callback(error);

        // teardown the old addons
        async.eachSeries(_.difference(oldManifest.addons, app.manifest.addons), function iterator(addon, iteratorCallback) {
            if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

            KNOWN_ADDONS[addon].teardown(app, iteratorCallback);
        }, callback);
    });
}

function getEnvironment(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    appdb.getAddonConfigByAppId(appId, callback);
}

function getLinksSync(app) {
    assert(typeof app === 'object');
    assert(!app.manifest.addons || util.isArray(app.manifest.addons));

    var links = [ ];

    if (!app.manifest.addons) return links;

    for (var i = 0; i < app.manifest.addons.length; i++) {
        switch (app.manifest.addons[i]) {
        case 'mysql': links.push('mysql:mysql'); break;
        case 'postgresql': links.push('postgresql:postgresql'); break;
        case 'sendmail': links.push('mail:mail'); break;
        case 'redis': links.push('redis-' + app.id + ':redis-' + app.id); break;
        default: break;
        }
    }

    return links;
}

function allocateOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var id = uuid.v4();
    var appId = app.id;
    var clientId = 'cid-' + uuid.v4();
    var clientSecret = uuid.v4();
    var name = app.manifest.title;
    var redirectURI = 'https://' + config.appFqdn(app.location);
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
        'MAIL_SMTP_SERVER=mail',
        'MAIL_SMTP_PORT=25',
        'MAIL_SMTP_USERNAME=' + app.location,
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

function forwardRedisPort(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    docker.getContainer('redis-' + appId).inspect(function (error, data) {
        if (error) return callback(new Error('Unable to inspect container:' + error));

        var redisPort = safe.query(data, 'NetworkSettings.Ports.6379/tcp[0].HostPort');
        if (!redisPort) return callback(new Error('Unable to get container port mapping'));

        vbox.forwardFromHostToVirtualBox('redis-' + appId, redisPort);

        return callback(null);
    });
}

function setupRedis(app, callback) {
    var redisPassword = generatePassword(64, false /* memorable */);
    var redisVarsFile = path.join(paths.ADDON_CONFIG_DIR, 'redis-' + app.id + '_vars.sh');
    var redisDataDir = path.join(paths.DATA_DIR, 'redis-' + app.id);

    if (!safe.fs.writeFileSync(redisVarsFile, 'REDIS_PASSWORD=' + redisPassword)) {
        return callback(new Error('Error writing redis config'));
    }

    if (!safe.fs.mkdirSync(redisDataDir) && safe.error.code !== 'EEXIST') return callback(new Error('Error creating redis data dir:' + safe.error));

    var createOptions = {
        name: 'redis-' + app.id,
        Hostname: config.appFqdn(app.location),
        Tty: true,
        Image: 'girish/redis:0.2',
        Cmd: null,
        Volumes: { },
        VolumesFrom: ''
    };

    var isMac = os.platform() === 'darwin';

    var startOptions = {
        Binds: [
            redisVarsFile + ':/etc/redis/redis_vars.sh:r',
            redisDataDir + ':/var/lib/redis:rw'
        ],
        // On Mac (boot2docker), we have to export the port to external world for port forwarding from Mac to work
        // On linux, export to localhost only for testing purposes and not for the app itself
        PortBindings: {
            '6379/tcp': [{ HostPort: '0', HostIp: isMac ? '0.0.0.0' : '127.0.0.1' }]
        },
        RestartPolicy: {
            'Name': 'always',
            'MaximumRetryCount': 0
        }
    };

    var env = [ 'REDIS_URL=redis://redisuser:' + redisPassword + '@redis-' + app.id + ':6379' ];

    var redisContainer = docker.getContainer(createOptions.name);
    redisContainer.remove({ force: true, v: false }, function (ignoredError) {
        docker.createContainer(createOptions, function (error) {
            if (error && error.statusCode !== 409) return callback(error); // if not already created

            redisContainer.start(startOptions, function (error) {
                if (error && error.statusCode !== 304) return callback(error); // if not already running

                appdb.setAddonConfig(app.id, 'redis', env, function (error) {
                    if (error) return callback(error);

                    forwardRedisPort(app.id, callback);
                });
            });
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
       if (error && error.statusCode === 404) return callback(null);
       if (error) return callback(new Error('Error removing container:' + error));

       vbox.unforwardFromHostToVirtualBox('redis-' + app.id);

       safe.fs.unlinkSync(paths.ADDON_CONFIG_DIR, 'redis-' + app.id + '_vars.sh');

        execFile(SUDO, [ RMAPPDIR_CMD, 'redis-' + app.id ], { }, function (error, stdout, stderr) {
            if (error) return callback(new Error('Error removing redis data:' + error));

            appdb.unsetAddonConfig(app.id, 'redis', callback);
        });
   });
}

