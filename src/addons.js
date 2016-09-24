'use strict';

exports = module.exports = {
    setupAddons: setupAddons,
    teardownAddons: teardownAddons,
    backupAddons: backupAddons,
    restoreAddons: restoreAddons,

    getEnvironment: getEnvironment,
    getBindsSync: getBindsSync,
    getContainerNamesSync: getContainerNamesSync,

    // exported for testing
    _setupOauth: setupOauth,
    _teardownOauth: teardownOauth
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    clients = require('./clients.js'),
    config = require('./config.js'),
    ClientsError = clients.ClientsError,
    debug = require('debug')('box:addons'),
    docker = require('./docker.js'),
    dockerConnection = docker.connection,
    fs = require('fs'),
    generatePassword = require('password-generator'),
    hat = require('hat'),
    infra = require('./infra_version.js'),
    mailboxdb = require('./mailboxdb.js'),
    once = require('once'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    util = require('util');

var NOOP = function (app, options, callback) { return callback(); };

// setup can be called multiple times for the same app (configure crash restart) and existing data must not be lost
// teardown is destructive. app data stored with the addon is lost
var KNOWN_ADDONS = {
    email: {
        setup: setupEmail,
        teardown: teardownEmail,
        backup: NOOP,
        restore: setupEmail
    },
    ldap: {
        setup: setupLdap,
        teardown: teardownLdap,
        backup: NOOP,
        restore: setupLdap
    },
    localstorage: {
        setup: NOOP, // docker creates the directory for us
        teardown: NOOP,
        backup: NOOP, // no backup because it's already inside app data
        restore: NOOP
    },
    mongodb: {
        setup: setupMongoDb,
        teardown: teardownMongoDb,
        backup: backupMongoDb,
        restore: restoreMongoDb
    },
    mysql: {
        setup: setupMySql,
        teardown: teardownMySql,
        backup: backupMySql,
        restore: restoreMySql,
    },
    oauth: {
        setup: setupOauth,
        teardown: teardownOauth,
        backup: NOOP,
        restore: setupOauth
    },
    postgresql: {
        setup: setupPostgreSql,
        teardown: teardownPostgreSql,
        backup: backupPostgreSql,
        restore: restorePostgreSql
    },
    recvmail: {
        setup: setupRecvMail,
        teardown: teardownRecvMail,
        backup: NOOP,
        restore: setupRecvMail
    },
    redis: {
        setup: setupRedis,
        teardown: teardownRedis,
        backup: backupRedis,
        restore: setupRedis // same thing
    },
    sendmail: {
        setup: setupSendMail,
        teardown: teardownSendMail,
        backup: NOOP,
        restore: setupSendMail
    },
    scheduler: {
        setup: NOOP,
        teardown: NOOP,
        backup: NOOP,
        restore: NOOP
    },
    simpleauth: {
        setup: setupSimpleAuth,
        teardown: teardownSimpleAuth,
        backup: NOOP,
        restore: setupSimpleAuth
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

function setupAddons(app, addons, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!addons || typeof addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!addons) return callback(null);

    debugApp(app, 'setupAddons: Settings up %j', Object.keys(addons));

    async.eachSeries(Object.keys(addons), function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        debugApp(app, 'Setting up addon %s with options %j', addon, addons[addon]);

        KNOWN_ADDONS[addon].setup(app, addons[addon], iteratorCallback);
    }, callback);
}

function teardownAddons(app, addons, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!addons || typeof addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    if (!addons) return callback(null);

    debugApp(app, 'teardownAddons: Tearing down %j', Object.keys(addons));

    async.eachSeries(Object.keys(addons), function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        debugApp(app, 'Tearing down addon %s with options %j', addon, addons[addon]);

        KNOWN_ADDONS[addon].teardown(app, addons[addon], iteratorCallback);
    }, callback);
}

function backupAddons(app, addons, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!addons || typeof addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'backupAddons');

    if (!addons) return callback(null);

    debugApp(app, 'backupAddons: Backing up %j', Object.keys(addons));

    async.eachSeries(Object.keys(addons), function iterator (addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].backup(app, addons[addon], iteratorCallback);
    }, callback);
}

function restoreAddons(app, addons, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!addons || typeof addons === 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'restoreAddons');

    if (!addons) return callback(null);

    debugApp(app, 'restoreAddons: restoring %j', Object.keys(addons));

    async.eachSeries(Object.keys(addons), function iterator (addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].restore(app, addons[addon], iteratorCallback);
    }, callback);
}

function getEnvironment(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    appdb.getAddonConfigByAppId(app.id, callback);
}

function getBindsSync(app, addons) {
    assert.strictEqual(typeof app, 'object');
    assert(!addons || typeof addons === 'object');

    var binds = [ ];

    if (!addons) return binds;

    for (var addon in addons) {
        switch (addon) {
        case '_docker': binds.push('/var/run/docker.sock:/var/run/docker.sock:rw'); break;
        case 'localstorage': binds.push(path.join(paths.DATA_DIR, app.id, 'data') + ':/app/data:rw'); break;
        default: break;
        }
    }

    return binds;
}

function getContainerNamesSync(app, addons) {
    assert.strictEqual(typeof app, 'object');
    assert(!addons || typeof addons === 'object');

    var names = [ ];

    if (!addons) return names;

    for (var addon in addons) {
        switch (addon) {
        case 'scheduler':
            // names here depend on how scheduler.js creates containers
            names = names.concat(Object.keys(addons.scheduler).map(function (taskName) { return app.id + '-' + taskName; }));
            break;
        default: break;
        }
    }

    return names;
}

function setupOauth(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var appId = app.id;
    var redirectURI = 'https://' + config.appFqdn(app.location);
    var scope = 'profile';

    clients.delByAppIdAndType(appId, clients.TYPE_OAUTH, function (error) { // remove existing creds
        if (error && error.reason !== ClientsError.NOT_FOUND) return callback(error);

        clients.add(appId, clients.TYPE_OAUTH, redirectURI, scope, function (error, result) {
            if (error) return callback(error);

            var env = [
                'OAUTH_CLIENT_ID=' + result.id,
                'OAUTH_CLIENT_SECRET=' + result.clientSecret,
                'OAUTH_ORIGIN=' + config.adminOrigin()
            ];

            debugApp(app, 'Setting oauth addon config to %j', env);

            appdb.setAddonConfig(appId, 'oauth', env, callback);
        });
    });
}

function teardownOauth(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'teardownOauth');

    clients.delByAppIdAndType(app.id, clients.TYPE_OAUTH, function (error) {
        if (error && error.reason !== ClientsError.NOT_FOUND) console.error(error);

        appdb.unsetAddonConfig(app.id, 'oauth', callback);
    });
}

function setupSimpleAuth(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var appId = app.id;
    var scope = 'profile';

    clients.delByAppIdAndType(app.id, clients.TYPE_SIMPLE_AUTH, function (error) { // remove existing creds
        if (error && error.reason !== ClientsError.NOT_FOUND) return callback(error);

        clients.add(appId, clients.TYPE_SIMPLE_AUTH, '', scope, function (error, result) {
            if (error) return callback(error);

            var env = [
                'SIMPLE_AUTH_SERVER=172.18.0.1',
                'SIMPLE_AUTH_PORT=' + config.get('simpleAuthPort'),
                'SIMPLE_AUTH_URL=http://172.18.0.1:' + config.get('simpleAuthPort'), // obsolete, remove
                'SIMPLE_AUTH_ORIGIN=http://172.18.0.1:' + config.get('simpleAuthPort'),
                'SIMPLE_AUTH_CLIENT_ID=' + result.id
            ];

            debugApp(app, 'Setting simple auth addon config to %j', env);

            appdb.setAddonConfig(appId, 'simpleauth', env, callback);
        });
    });
}

function teardownSimpleAuth(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'teardownSimpleAuth');

    clients.delByAppIdAndType(app.id, clients.TYPE_SIMPLE_AUTH, function (error) {
        if (error && error.reason !== ClientsError.NOT_FOUND) console.error(error);

        appdb.unsetAddonConfig(app.id, 'simpleauth', callback);
    });
}

function setupEmail(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    // note that "external" access info can be derived from MAIL_DOMAIN (since it's part of user documentation)
    var env = [
        'MAIL_SMTP_SERVER=mail',
        'MAIL_SMTP_PORT=2525',
        'MAIL_IMAP_SERVER=mail',
        'MAIL_IMAP_PORT=9993',
        'MAIL_SIEVE_SERVER=mail',
        'MAIL_SIEVE_PORT=4190',
        'MAIL_DOMAIN=' + config.fqdn()
    ];

    debugApp(app, 'Setting up Email');

    appdb.setAddonConfig(app.id, 'email', env, callback);
}

function teardownEmail(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Tearing down Email');

    appdb.unsetAddonConfig(app.id, 'email', callback);
}

function setupLdap(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var env = [
        'LDAP_SERVER=172.18.0.1',
        'LDAP_PORT=' + config.get('ldapPort'),
        'LDAP_URL=ldap://172.18.0.1:' + config.get('ldapPort'),
        'LDAP_USERS_BASE_DN=ou=users,dc=cloudron',
        'LDAP_GROUPS_BASE_DN=ou=groups,dc=cloudron',
        'LDAP_BIND_DN=cn='+ app.id + ',ou=apps,dc=cloudron',
        'LDAP_BIND_PASSWORD=' + hat(4 * 128) // this is ignored
    ];

    debugApp(app, 'Setting up LDAP');

    appdb.setAddonConfig(app.id, 'ldap', env, callback);
}

function teardownLdap(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Tearing down LDAP');

    appdb.unsetAddonConfig(app.id, 'ldap', callback);
}

function setupSendMail(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up SendMail');

    mailboxdb.getByOwnerId(app.id, function (error, mailbox) {
        if (error) return callback(error);

        var env = [
            "MAIL_SMTP_SERVER=mail",
            "MAIL_SMTP_PORT=2525",
            "MAIL_SMTP_USERNAME=" + mailbox.name,
            "MAIL_SMTP_PASSWORD=" + app.id,
            "MAIL_FROM=" + mailbox.name + '@' + config.fqdn(),
            "MAIL_DOMAIN=" + config.fqdn()
        ];
        debugApp(app, 'Setting sendmail addon config to %j', env);
        appdb.setAddonConfig(app.id, 'sendmail', env, callback);
    });
}

function teardownSendMail(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Tearing down sendmail');

    appdb.unsetAddonConfig(app.id, 'sendmail', callback);
}

function setupRecvMail(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up recvmail');

    mailboxdb.getByOwnerId(app.id, function (error, mailbox) {
        if (error) return callback(error);

        var env = [
            "MAIL_IMAP_SERVER=mail",
            "MAIL_IMAP_PORT=9993",
            "MAIL_IMAP_USERNAME=" + mailbox.name,
            "MAIL_IMAP_PASSWORD=" + app.id,
            "MAIL_TO=" + mailbox.name + '@' + config.fqdn(),
            "MAIL_DOMAIN=" + config.fqdn()
        ];

        debugApp(app, 'Setting sendmail addon config to %j', env);
        appdb.setAddonConfig(app.id, 'recvmail', env, callback);
    });
}

function teardownRecvMail(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Tearing down recvmail');

    appdb.unsetAddonConfig(app.id, 'recvmail', callback);
}

function setupMySql(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up mysql');

    var cmd = [ '/addons/mysql/service.sh', options.multipleDatabases ? 'add-prefix' : 'add', app.id ];

    docker.execContainer('mysql', cmd, { bufferStdout: true }, function (error, stdout) {
        if (error) return callback(error);

        var env = stdout.toString('utf8').split('\n').slice(0, -1); // remove trailing newline
        debugApp(app, 'Setting mysql addon config to %j', env);
        appdb.setAddonConfig(app.id, 'mysql', env, callback);
    });
}

function teardownMySql(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var cmd = [ '/addons/mysql/service.sh', options.multipleDatabases ? 'remove-prefix' : 'remove', app.id ];

    debugApp(app, 'Tearing down mysql');

    docker.execContainer('mysql', cmd, { }, function (error) {
        if (error) return callback(error);

        appdb.unsetAddonConfig(app.id, 'mysql', callback);
    });
}

function backupMySql(app, options, callback) {
    debugApp(app, 'Backing up mysql');

    callback = once(callback); // ChildProcess exit may or may not be called after error

    var output = fs.createWriteStream(path.join(paths.DATA_DIR, app.id, 'mysqldump'));
    output.on('error', callback);

    var cmd = [ '/addons/mysql/service.sh', options.multipleDatabases ? 'backup-prefix' : 'backup', app.id ];

    docker.execContainer('mysql', cmd, { stdout: output }, callback);
}

function restoreMySql(app, options, callback) {
    callback = once(callback); // ChildProcess exit may or may not be called after error

    setupMySql(app, options, function (error) {
        if (error) return callback(error);

        debugApp(app, 'restoreMySql');

        var input = fs.createReadStream(path.join(paths.DATA_DIR, app.id, 'mysqldump'));
        input.on('error', callback);

        var cmd = [ '/addons/mysql/service.sh', options.multipleDatabases ? 'restore-prefix' : 'restore', app.id ];
        docker.execContainer('mysql', cmd, { stdin: input }, callback);
    });
}

function setupPostgreSql(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up postgresql');

    var cmd = [ '/addons/postgresql/service.sh', 'add', app.id ];

    docker.execContainer('postgresql', cmd, { bufferStdout: true }, function (error, stdout) {
        if (error) return callback(error);

        var env = stdout.toString('utf8').split('\n').slice(0, -1); // remove trailing newline
        debugApp(app, 'Setting postgresql addon config to %j', env);
        appdb.setAddonConfig(app.id, 'postgresql', env, callback);
    });
}

function teardownPostgreSql(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var cmd = [ '/addons/postgresql/service.sh', 'remove', app.id ];

    debugApp(app, 'Tearing down postgresql');

    docker.execContainer('postgresql', cmd, { }, function (error) {
        if (error) return callback(error);

        appdb.unsetAddonConfig(app.id, 'postgresql', callback);
    });
}

function backupPostgreSql(app, options, callback) {
    debugApp(app, 'Backing up postgresql');

    callback = once(callback); // ChildProcess exit may or may not be called after error

    var output = fs.createWriteStream(path.join(paths.DATA_DIR, app.id, 'postgresqldump'));
    output.on('error', callback);

    var cmd = [ '/addons/postgresql/service.sh', 'backup', app.id ];

    docker.execContainer('postgresql', cmd, { stdout: output }, callback);
}

function restorePostgreSql(app, options, callback) {
    callback = once(callback);

    setupPostgreSql(app, options, function (error) {
        if (error) return callback(error);

        debugApp(app, 'restorePostgreSql');

        var input = fs.createReadStream(path.join(paths.DATA_DIR, app.id, 'postgresqldump'));
        input.on('error', callback);

        var cmd = [ '/addons/postgresql/service.sh', 'restore', app.id ];

        docker.execContainer('postgresql', cmd, { stdin: input }, callback);
    });
}

function setupMongoDb(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debugApp(app, 'Setting up mongodb');

    var cmd = [ '/addons/mongodb/service.sh', 'add', app.id ];

    docker.execContainer('mongodb', cmd, { bufferStdout: true }, function (error, stdout) {
        if (error) return callback(error);

        var env = stdout.toString('utf8').split('\n').slice(0, -1); // remove trailing newline
        debugApp(app, 'Setting mongodb addon config to %j', env);
        appdb.setAddonConfig(app.id, 'mongodb', env, callback);
    });
}

function teardownMongoDb(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var cmd = [ '/addons/mongodb/service.sh', 'remove', app.id ];

    debugApp(app, 'Tearing down mongodb');

    docker.execContainer('mongodb', cmd, { }, function (error) {
        if (error) return callback(error);

        appdb.unsetAddonConfig(app.id, 'mongodb', callback);
    });
}

function backupMongoDb(app, options, callback) {
    debugApp(app, 'Backing up mongodb');

    callback = once(callback); // ChildProcess exit may or may not be called after error

    var output = fs.createWriteStream(path.join(paths.DATA_DIR, app.id, 'mongodbdump'));
    output.on('error', callback);

    var cmd = [ '/addons/mongodb/service.sh', 'backup', app.id ];

    docker.execContainer('mongodb', cmd, { stdout: output }, callback);
}

function restoreMongoDb(app, options, callback) {
    callback = once(callback); // ChildProcess exit may or may not be called after error

    setupMongoDb(app, options, function (error) {
        if (error) return callback(error);

        debugApp(app, 'restoreMongoDb');

        var input = fs.createReadStream(path.join(paths.DATA_DIR, app.id, 'mongodbdump'));
        input.on('error', callback);

        var cmd = [ '/addons/mongodb/service.sh', 'restore', app.id ];
        docker.execContainer('mongodb', cmd, { stdin: input }, callback);
    });
}

// Ensures that app's addon redis container is running. Can be called when named container already exists/running
function setupRedis(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var redisPassword = generatePassword(64, false /* memorable */, /[\w\d_]/); // ensure no / in password for being sed friendly (and be uri friendly)
    var redisVarsFile = path.join(paths.ADDON_CONFIG_DIR, 'redis-' + app.id + '_vars.sh');
    var redisDataDir = path.join(paths.DATA_DIR, app.id + '/redis');

    if (!safe.fs.writeFileSync(redisVarsFile, 'REDIS_PASSWORD=' + redisPassword)) {
        return callback(new Error('Error writing redis config'));
    }

    if (!safe.fs.mkdirSync(redisDataDir) && safe.error.code !== 'EEXIST') return callback(new Error('Error creating redis data dir:' + safe.error));

    const tag = infra.images.redis.tag, redisName = 'redis-' + app.id;
    const cmd = `docker run --restart=always -d --name=${redisName} \
                --net cloudron \
                --net-alias ${redisName} \
                -m 100m \
                --memory-swap 150m \
                -v ${redisVarsFile}:/etc/redis/redis_vars.sh:ro \
                -v ${redisDataDir}:/var/lib/redis:rw \
                --read-only -v /tmp -v /run ${tag}`;

    var env = [
        'REDIS_URL=redis://redisuser:' + redisPassword + '@redis-' + app.id,
        'REDIS_PASSWORD=' + redisPassword,
        'REDIS_HOST=' + redisName,
        'REDIS_PORT=6379'
    ];

    async.series([
        // stop so that redis can flush itself with SIGTERM
        shell.execSync.bind(null, 'stopRedis', `docker stop --time=10 ${redisName} 2>/dev/null || true`),
        shell.execSync.bind(null, 'stopRedis', `docker rm --volumes ${redisName} 2>/dev/null || true`),
        shell.execSync.bind(null, 'startRedis', cmd),
        appdb.setAddonConfig.bind(null, app.id, 'redis', env)
    ], function (error) {
        if (error) debug('Error setting up redis: ', error);
        callback(error);
    });
}

function teardownRedis(app, options, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

   var container = dockerConnection.getContainer('redis-' + app.id);

   var removeOptions = {
       force: true, // kill container if it's running
       v: true // removes volumes associated with the container
   };

   container.remove(removeOptions, function (error) {
       if (error && error.statusCode !== 404) return callback(new Error('Error removing container:' + error));

       safe.fs.unlinkSync(paths.ADDON_CONFIG_DIR, 'redis-' + app.id + '_vars.sh');

        shell.sudo('teardownRedis', [ RMAPPDIR_CMD, app.id + '/redis' ], function (error, stdout, stderr) {
            if (error) return callback(new Error('Error removing redis data:' + error));

            appdb.unsetAddonConfig(app.id, 'redis', callback);
        });
   });
}

function backupRedis(app, options, callback) {
    debugApp(app, 'Backing up redis');

    var cmd = [ '/addons/redis/service.sh', 'backup' ]; // the redis dir is volume mounted

    docker.execContainer('redis-' + app.id, cmd, { }, callback);
}
