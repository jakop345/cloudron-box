'use strict';

exports = module.exports = {
    setupAddons: setupAddons,
    teardownAddons: teardownAddons,
    updateAddons: updateAddons,
    backupAddons: backupAddons,
    restoreAddons: restoreAddons,

    getEnvironment: getEnvironment,
    getLinksSync: getLinksSync,
    getBindsSync: getBindsSync,

    // exported for testing
    _allocateOAuthCredentials: allocateOAuthCredentials,
    _removeOAuthCredentials: removeOAuthCredentials
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    clientdb = require('./clientdb.js'),
    config = require('./config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:addons'),
    docker = require('./docker.js'),
    fs = require('fs'),
    generatePassword = require('password-generator'),
    hat = require('hat'),
    MemoryStream = require('memorystream'),
    once = require('once'),
    os = require('os'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    spawn = child_process.spawn,
    tokendb = require('./tokendb.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    vbox = require('./vbox.js'),
    _ = require('underscore');

var NOOP = function (app, callback) { return callback(); };

// setup can be called multiple times for the same app (configure crash restart) and existing data must not be lost
// teardown is destructive. app data stored with the addon is lost
var KNOWN_ADDONS = {
    oauth: {
        setup: allocateOAuthCredentials,
        teardown: removeOAuthCredentials,
        backup: NOOP,
        restore: allocateOAuthCredentials
    },
    token: {
        setup: allocateAccessToken,
        teardown: removeAccessToken,
        backup: NOOP,
        restore: allocateAccessToken
    },
    ldap: {
        setup: setupLdap,
        teardown: teardownLdap,
        backup: NOOP,
        restore: setupLdap
    },
    sendmail: {
        setup: setupSendMail,
        teardown: teardownSendMail,
        backup: NOOP,
        restore: setupSendMail
    },
    mysql: {
        setup: setupMySql,
        teardown: teardownMySql,
        backup: backupMySql,
        restore: restoreMySql,
    },
    postgresql: {
        setup: setupPostgreSql,
        teardown: teardownPostgreSql,
        backup: backupPostgreSql,
        restore: restorePostgreSql
    },
    mongodb: {
        setup: setupMongoDb,
        teardown: teardownMongoDb,
        backup: backupMongoDb,
        restore: restoreMongoDb
    },
    redis: {
        setup: setupRedis,
        teardown: teardownRedis,
        backup: NOOP, // no backup because we store redis as part of app's volume
        restore: setupRedis // same thing
    },
    localstorage: {
        setup: NOOP, // docker creates the directory for us
        teardown: NOOP,
        backup: NOOP, // no backup because it's already inside app data
        restore: NOOP
    },
    _docker: {
        setup: NOOP,
        teardown: NOOP,
        backup: NOOP,
        restore: NOOP
    }
};

var RMAPPDIR_CMD = path.join(__dirname, 'scripts/rmappdir.sh');

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? (app.location || 'naked_domain') : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

function setupAddons(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof manifest, 'object');
    assert(!manifest.addons || typeof manifest.addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!manifest.addons) return callback(null);

    async.eachSeries(Object.keys(manifest.addons), function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        debugApp(app, 'Setting up addon %s', addon);

        KNOWN_ADDONS[addon].setup(app, iteratorCallback);
    }, callback);
}

function teardownAddons(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof manifest, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!manifest) return callback(null);

    assert(!manifest.addons || typeof manifest.addons === 'object');

    if (!manifest.addons) return callback(null);

    async.eachSeries(Object.keys(manifest.addons), function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        debugApp(app, 'Tearing down addon %s', addon);

        KNOWN_ADDONS[addon].teardown(app, iteratorCallback);
    }, callback);
}

function updateAddons(app, oldManifest, newManifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!oldManifest.addons || typeof oldManifest.addons === 'object');
    assert(!newManifest.addons || typeof newManifest.addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    setupAddons(app, newManifest, function (error) {
        if (error) return callback(error);

        if (!oldManifest || !oldManifest.addons) return callback(null);

        // teardown the old addons
        async.eachSeries(_.difference(Object.keys(oldManifest.addons), Object.keys(newManifest.addons)), function iterator(addon, iteratorCallback) {
            if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

            KNOWN_ADDONS[addon].teardown(app, iteratorCallback);
        }, callback);
    });
}

function backupAddons(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!manifest.addons || typeof manifest.addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'backupAddons');

    if (!manifest.addons) return callback(null);

    async.eachSeries(Object.keys(manifest.addons), function iterator (addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].backup(app, iteratorCallback);
    }, callback);
}

function restoreAddons(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!manifest.addons || typeof manifest.addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'restoreAddons');

    if (!manifest.addons) return callback(null);

    async.eachSeries(Object.keys(manifest.addons), function iterator (addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].restore(app, iteratorCallback);
    }, callback);
}

function getEnvironment(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    appdb.getAddonConfigByAppId(app.id, callback);
}

function getLinksSync(app, manifest) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof manifest, 'object');
    assert(!manifest.addons || typeof manifest.addons === 'object');

    var links = [ ];

    if (!manifest.addons) return links;

    for (var addon in manifest.addons) {
        switch (addon) {
        case 'mysql': links.push('mysql:mysql'); break;
        case 'postgresql': links.push('postgresql:postgresql'); break;
        case 'sendmail': links.push('mail:mail'); break;
        case 'redis': links.push('redis-' + app.id + ':redis-' + app.id); break;
        case 'mongodb': links.push('mongodb:mongodb'); break;
        default: break;
        }
    }

    return links;
}

function getBindsSync(app, manifest) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof manifest, 'object');
    assert(!manifest.addons || typeof manifest.addons === 'object');

    var binds = [ ];

    if (!manifest.addons) return binds;

    for (var addon in manifest.addons) {
        switch (addon) {
        case '_docker': binds.push('/var/run/docker.sock:/var/run/docker.sock:rw'); break;
        case 'localstorage': binds.push(path.join(paths.DATA_DIR, app.id, 'data') + ':/app/data:rw'); break;
        default: break;
        }
    }

    return binds;
}

function allocateOAuthCredentials(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var appId = app.id;
    var id = 'cid-addon-' + uuid.v4();
    var clientSecret = hat(256);
    var redirectURI = 'https://' + config.appFqdn(app.location);
    var scope = 'profile,roleUser';

    debugApp(app, 'allocateOAuthCredentials: id:%s clientSecret:%s', id, clientSecret);

    clientdb.delByAppId('addon-' + appId, function (error) { // remove existing creds
        if (error && error.reason !== DatabaseError.NOT_FOUND) return callback(error);

        clientdb.add(id, 'addon-' + appId, clientSecret, redirectURI, scope, function (error) {
            if (error) return callback(error);

            var env = [
                'OAUTH_CLIENT_ID=' + id,
                'OAUTH_CLIENT_SECRET=' + clientSecret,
                'OAUTH_ORIGIN=' + config.adminOrigin()
            ];

            debugApp(app, 'Setting oauth addon config to %j', env);

            appdb.setAddonConfig(appId, 'oauth', env, callback);
        });
    });
}

function removeOAuthCredentials(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'removeOAuthCredentials');

    clientdb.delByAppId('addon-' + app.id, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) console.error(error);

        appdb.unsetAddonConfig(app.id, 'oauth', callback);
    });
}

function setupLdap(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var env = [
        'LDAP_SERVER=172.17.42.1',
        'LDAP_PORT=3002',
        'LDAP_URL=ldap://172.17.42.1:3002',
        'LDAP_USERS_BASE_DN=ou=users,dc=cloudron',
        'LDAP_GROUPS_BASE_DN=ou=groups,dc=cloudron'
    ];

    debugApp(app, 'Setting up LDAP');

    appdb.setAddonConfig(app.id, 'ldap', env, callback);
}

function teardownLdap(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Tearing down LDAP');

    appdb.unsetAddonConfig(app.id, 'ldap', callback);
}

function setupSendMail(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var env = [
        'MAIL_SMTP_SERVER=mail',
        'MAIL_SMTP_PORT=25',
        'MAIL_SMTP_USERNAME=' + (app.location || app.id), // use app.id for bare domains
        'MAIL_DOMAIN=' + config.fqdn()
    ];

    debugApp(app, 'Setting up sendmail');

    appdb.setAddonConfig(app.id, 'sendmail', env, callback);
}

function teardownSendMail(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Tearing down sendmail');

    appdb.unsetAddonConfig(app.id, 'sendmail', callback);
}

function setupMySql(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up mysql');

    var container = docker.getContainer('mysql');
    var cmd = [ '/addons/mysql/service.sh', 'add', app.id ];

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
            if (error) return callback(error);

            var stdout = new MemoryStream();
            var stderr = new MemoryStream();

            execContainer.modem.demuxStream(stream, stdout, stderr);
            stderr.on('data', function (data) { debugApp(app, data.toString('utf8')); }); // set -e output

            var chunks = [ ];
            stdout.on('data', function (chunk) { chunks.push(chunk); });

            stream.on('error', callback);
            stream.on('end', function () {
                var env = Buffer.concat(chunks).toString('utf8').split('\n').slice(0, -1); // remove trailing newline
                debugApp(app, 'Setting mysql addon config to %j', env);
                appdb.setAddonConfig(app.id, 'mysql', env, callback);
            });
        });
    });
}

function teardownMySql(app, callback) {
    var container = docker.getContainer('mysql');
    var cmd = [ '/addons/mysql/service.sh', 'remove', app.id ];

    debugApp(app, 'Tearing down mysql');

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
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

function backupMySql(app, callback) {
    debugApp(app, 'Backing up mysql');

    callback = once(callback); // ChildProcess exit may or may not be called after error

    var output = fs.createWriteStream(path.join(paths.DATA_DIR, app.id, 'mysqldump'));
    output.on('error', callback);

    var cp = spawn('/usr/bin/docker', [ 'exec', 'mysql', '/addons/mysql/service.sh', 'backup', app.id ]);
    cp.on('error', callback);
    cp.on('exit', function (code, signal) {
        debugApp(app, 'backupMySql: done. code:%s signal:%s', code, signal);
        if (!callback.called) callback(code ? 'backupMySql failed with status ' + code : null);
    });

    cp.stdout.pipe(output);
    cp.stderr.pipe(process.stderr);
}

function restoreMySql(app, callback) {
    callback = once(callback); // ChildProcess exit may or may not be called after error

    setupMySql(app, function (error) {
        if (error) return callback(error);

        debugApp(app, 'restoreMySql');

        var input = fs.createReadStream(path.join(paths.DATA_DIR, app.id, 'mysqldump'));
        input.on('error', callback);

        // cannot get this to work through docker.exec
        var cp = spawn('/usr/bin/docker', [ 'exec', '-i', 'mysql', '/addons/mysql/service.sh', 'restore', app.id ]);
        cp.on('error', callback);
        cp.on('exit', function (code, signal) {
            debugApp(app, 'restoreMySql: done %s %s', code, signal);
            if (!callback.called) callback(code ? 'restoreMySql failed with status ' + code : null);
        });

        cp.stdout.pipe(process.stdout);
        cp.stderr.pipe(process.stderr);
        input.pipe(cp.stdin).on('error', callback);
    });
}

function setupPostgreSql(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up postgresql');

    var container = docker.getContainer('postgresql');
    var cmd = [ '/addons/postgresql/service.sh', 'add', app.id ];

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
            if (error) return callback(error);

            var stdout = new MemoryStream();
            var stderr = new MemoryStream();

            execContainer.modem.demuxStream(stream, stdout, stderr);
            stderr.on('data', function (data) { debugApp(app, data.toString('utf8')); }); // set -e output

            var chunks = [ ];
            stdout.on('data', function (chunk) { chunks.push(chunk); });

            stream.on('error', callback);
            stream.on('end', function () {
                var env = Buffer.concat(chunks).toString('utf8').split('\n').slice(0, -1); // remove trailing newline
                debugApp(app, 'Setting postgresql addon config to %j', env);
                appdb.setAddonConfig(app.id, 'postgresql', env, callback);
            });
        });
    });
}

function teardownPostgreSql(app, callback) {
    var container = docker.getContainer('postgresql');
    var cmd = [ '/addons/postgresql/service.sh', 'remove', app.id ];

    debugApp(app, 'Tearing down postgresql');

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
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

function backupPostgreSql(app, callback) {
    debugApp(app, 'Backing up postgresql');

    callback = once(callback); // ChildProcess exit may or may not be called after error

    var output = fs.createWriteStream(path.join(paths.DATA_DIR, app.id, 'postgresqldump'));
    output.on('error', callback);

    var cp = spawn('/usr/bin/docker', [ 'exec', 'postgresql', '/addons/postgresql/service.sh', 'backup', app.id ]);
    cp.on('error', callback);
    cp.on('exit', function (code, signal) {
        debugApp(app, 'backupPostgreSql: done %s %s', code, signal);
        if (!callback.called) callback(code ? 'backupPostgreSql failed with status ' + code : null);
    });

    cp.stdout.pipe(output);
    cp.stderr.pipe(process.stderr);
}

function restorePostgreSql(app, callback) {
    callback = once(callback); // ChildProcess exit may or may not be called after error

    setupPostgreSql(app, function (error) {
        if (error) return callback(error);

        debugApp(app, 'restorePostgreSql');

        var input = fs.createReadStream(path.join(paths.DATA_DIR, app.id, 'postgresqldump'));
        input.on('error', callback);

        // cannot get this to work through docker.exec
        var cp = spawn('/usr/bin/docker', [ 'exec', '-i', 'postgresql', '/addons/postgresql/service.sh', 'restore', app.id ]);
        cp.on('error', callback);
        cp.on('exit', function (code, signal) {
            debugApp(app, 'restorePostgreSql: done %s %s', code, signal);
            if (!callback.called) callback(code ? 'restorePostgreSql failed with status ' + code : null);
        });

        cp.stdout.pipe(process.stdout);
        cp.stderr.pipe(process.stderr);
        input.pipe(cp.stdin).on('error', callback);
    });
}

function setupMongoDb(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up mongodb');

    var container = docker.getContainer('mongodb');
    var cmd = [ '/addons/mongodb/service.sh', 'add', app.id ];

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
            if (error) return callback(error);

            var stdout = new MemoryStream();
            var stderr = new MemoryStream();

            execContainer.modem.demuxStream(stream, stdout, stderr);
            stderr.on('data', function (data) { debugApp(app, data.toString('utf8')); }); // set -e output

            var chunks = [ ];
            stdout.on('data', function (chunk) { chunks.push(chunk); });

            stream.on('error', callback);
            stream.on('end', function () {
                var env = Buffer.concat(chunks).toString('utf8').split('\n').slice(0, -1); // remove trailing newline
                debugApp(app, 'Setting mongodb addon config to %j', env);
                appdb.setAddonConfig(app.id, 'mongodb', env, callback);
            });
        });
    });
}

function teardownMongoDb(app, callback) {
    var container = docker.getContainer('mongodb');
    var cmd = [ '/addons/mongodb/service.sh', 'remove', app.id ];

    debugApp(app, 'Tearing down mongodb');

    container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true }, function (error, execContainer) {
        if (error) return callback(error);

        execContainer.start(function (error, stream) {
            if (error) return callback(error);

            var data = '';
            stream.on('error', callback);
            stream.on('data', function (d) { data += d.toString('utf8'); });
            stream.on('end', function () {
                appdb.unsetAddonConfig(app.id, 'mongodb', callback);
            });
        });
    });
}

function backupMongoDb(app, callback) {
    debugApp(app, 'Backing up mongodb');

    callback = once(callback); // ChildProcess exit may or may not be called after error

    var output = fs.createWriteStream(path.join(paths.DATA_DIR, app.id, 'mongodbdump'));
    output.on('error', callback);

    var cp = spawn('/usr/bin/docker', [ 'exec', 'mongodb', '/addons/mongodb/service.sh', 'backup', app.id ]);
    cp.on('error', callback);
    cp.on('exit', function (code, signal) {
        debugApp(app, 'backupMongoDb: done %s %s', code, signal);
        if (!callback.called) callback(code ? 'backupMongoDb failed with status ' + code : null);
    });

    cp.stdout.pipe(output);
    cp.stderr.pipe(process.stderr);
}

function restoreMongoDb(app, callback) {
    callback = once(callback); // ChildProcess exit may or may not be called after error

    setupMongoDb(app, function (error) {
        if (error) return callback(error);

        debugApp(app, 'restoreMongoDb');

        var input = fs.createReadStream(path.join(paths.DATA_DIR, app.id, 'mongodbdump'));
        input.on('error', callback);

        // cannot get this to work through docker.exec
        var cp = spawn('/usr/bin/docker', [ 'exec', '-i', 'mongodb', '/addons/mongodb/service.sh', 'restore', app.id ]);
        cp.on('error', callback);
        cp.on('exit', function (code, signal) {
            debugApp(app, 'restoreMongoDb: done %s %s', code, signal);
            if (!callback.called) callback(code ? 'restoreMongoDb failed with status ' + code : null);
        });

        cp.stdout.pipe(process.stdout);
        cp.stderr.pipe(process.stderr);
        input.pipe(cp.stdin).on('error', callback);
    });
}


function forwardRedisPort(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    docker.getContainer('redis-' + appId).inspect(function (error, data) {
        if (error) return callback(new Error('Unable to inspect container:' + error));

        var redisPort = parseInt(safe.query(data, 'NetworkSettings.Ports.6379/tcp[0].HostPort'), 10);
        if (!Number.isInteger(redisPort)) return callback(new Error('Unable to get container port mapping'));

        vbox.forwardFromHostToVirtualBox('redis-' + appId, redisPort);

        return callback(null);
    });
}

// Ensures that app's addon redis container is running. Can be called when named container already exists/running
function setupRedis(app, callback) {
    var redisPassword = generatePassword(64, false /* memorable */);
    var redisVarsFile = path.join(paths.ADDON_CONFIG_DIR, 'redis-' + app.id + '_vars.sh');
    var redisDataDir = path.join(paths.DATA_DIR, app.id + '/redis');

    if (!safe.fs.writeFileSync(redisVarsFile, 'REDIS_PASSWORD=' + redisPassword)) {
        return callback(new Error('Error writing redis config'));
    }

    if (!safe.fs.mkdirSync(redisDataDir) && safe.error.code !== 'EEXIST') return callback(new Error('Error creating redis data dir:' + safe.error));

    var createOptions = {
        name: 'redis-' + app.id,
        Hostname: config.appFqdn(app.location),
        Tty: true,
        Image: 'cloudron/redis:0.3.0',
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

    var env = [
        'REDIS_URL=redis://redisuser:' + redisPassword + '@redis-' + app.id,
        'REDIS_PASSWORD=' + redisPassword,
        'REDIS_HOST=redis-' + app.id,
        'REDIS_PORT=6379'
    ];

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
       if (error && error.statusCode !== 404) return callback(new Error('Error removing container:' + error));

       vbox.unforwardFromHostToVirtualBox('redis-' + app.id);

       safe.fs.unlinkSync(paths.ADDON_CONFIG_DIR, 'redis-' + app.id + '_vars.sh');

        shell.sudo('teardownRedis', [ RMAPPDIR_CMD, app.id + '/redis' ], function (error, stdout, stderr) {
            if (error) return callback(new Error('Error removing redis data:' + error));

            appdb.unsetAddonConfig(app.id, 'redis', callback);
        });
   });
}

function allocateAccessToken(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var token = tokendb.generateToken();
    var expiresAt = Number.MAX_SAFE_INTEGER;    // basically never expire
    var scopes = 'profile,users';               // TODO This should be put into the manifest and the user should know those
    var clientId = '';                          // meaningless for apps so far

   tokendb.delByIdentifier(tokendb.PREFIX_APP + app.id, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return callback(error);

        tokendb.add(token, tokendb.PREFIX_APP + app.id, clientId, expiresAt, scopes, function (error) {
            if (error) return callback(error);

            var env = [
                'CLOUDRON_TOKEN=' + token
            ];

            debugApp(app, 'Setting token addon config to %j', env);

            appdb.setAddonConfig(appId, 'token', env, callback);
        });
    });
}

function removeAccessToken(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    tokendb.delByIdentifier(tokendb.PREFIX_APP + app.id, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) console.error(error);

        appdb.unsetAddonConfig(app.id, 'token', callback);
    });
}

