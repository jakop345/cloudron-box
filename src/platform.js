'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    events: new (require('events').EventEmitter)(),
    EVENT_READY: 'ready',

    isReadySync: isReadySync
};

var apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    config = require('./config.js'),
    certificates = require('./certificates.js'),
    debug = require('debug')('box:platform'),
    fs = require('fs'),
    hat = require('hat'),
    infra = require('./infra_version.js'),
    mailboxes = require('./mailboxes.js'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    shell = require('./shell.js'),
    subdomains = require('./subdomains.js'),
    util = require('util'),
    _ = require('underscore');

var gPlatformReadyTimer = null;

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

function initialize(callback) {
    if (process.env.BOX_ENV === 'test' && !process.env.TEST_CREATE_INFRA) return callback();

    debug('initializing addon infrastructure');

    settings.events.on(settings.MAIL_CONFIG_KEY, function () { startMail(NOOP_CALLBACK); });

    var existingInfra = { version: 'none' };
    if (fs.existsSync(paths.INFRA_VERSION_FILE)) {
        existingInfra = safe.JSON.parse(fs.readFileSync(paths.INFRA_VERSION_FILE, 'utf8'));
        if (!existingInfra) existingInfra = { version: 'corrupt' };
    }

    // short-circuit for the restart case
    if (_.isEqual(infra, existingInfra)) {
        debug('platform is uptodate at version %s', infra.version);
        process.nextTick(function () { exports.events.emit(exports.EVENT_READY); });
        return callback();
    }

    debug('Updating infrastructure from %s to %s', existingInfra.version, infra.version);

    async.series([
        stopContainers.bind(null, existingInfra),
        createDockerNetwork,
        startAddons.bind(null, existingInfra),
        removeOldImages,
        startApps.bind(null, existingInfra),
        fs.writeFile.bind(fs, paths.INFRA_VERSION_FILE, JSON.stringify(infra))
    ], function (error) {
        if (error) return callback(error);

        // give 30 seconds for the platform to "settle". For example, mysql might still be initing the
        // database dir and we cannot call service scripts until that's done.
        // TODO: make this smarter to not wait for 30secs for the crash-restart case
        gPlatformReadyTimer = setTimeout(function () {
            debug('emitting platform ready');
            gPlatformReadyTimer = null;
            exports.events.emit(exports.EVENT_READY);
        }, 30000);

        callback();
    });
}

function uninitialize(callback) {
    clearTimeout(gPlatformReadyTimer);
    gPlatformReadyTimer = null;
    settings.events.removeListener(settings.MAIL_CONFIG_KEY, startMail);
    callback();
}

function isReadySync() {
    return gPlatformReadyTimer === null;
}

function removeOldImages(callback) {
    debug('removing old addon images');

    for (var imageName in infra.images) {
        var image = infra.images[imageName];
        debug('cleaning up images of %j', image);
        var cmd = 'docker images "%s" | tail -n +2 | awk \'{ print $1 ":" $2 }\' | grep -v "%s" | xargs --no-run-if-empty docker rmi';
        shell.execSync('removeOldImagesSync', util.format(cmd, image.repo, image.tag));
    }

    callback();
}

function stopContainers(existingInfra, callback) {
    // TODO: be nice and stop addons cleanly (example, shutdown commands)

    if (existingInfra.version !== infra.version) { // infra upgrade
        debug('stopping all containers for infra upgrade');
        shell.execSync('stopContainers', 'docker ps -qa | xargs --no-run-if-empty docker rm -f');
    } else {
        assert(typeof infra.images, 'object');
        var changedAddons = [ ];
        for (var imageName in infra.images) {
            if (infra.images[imageName].tag !== existingInfra.images[imageName].tag) changedAddons.push(imageName);
        }

        debug('stopping addons for incremental infra update: %j', changedAddons);
        // ignore error if container not found (and fail later) so that this code works across restarts
        shell.execSync('stopContainers', 'docker rm -f ' + changedAddons.join(' ') + ' || true');
    }

    callback();
}

function createDockerNetwork(callback) {
    shell.execSync('createDockerNetwork', 'docker network create --subnet=172.18.0.0/16 cloudron || true', callback);
}

function startGraphite(callback) {
    const tag = infra.images.graphite.tag;
    const dataDir = paths.DATA_DIR;

    const cmd = `docker run --restart=always -d --name="graphite" \
                --net cloudron \
                --net-alias graphite \
                -m 75m \
                --memory-swap 150m \
                -p 127.0.0.1:2003:2003 \
                -p 127.0.0.1:2004:2004 \
                -p 127.0.0.1:8000:8000 \
                -v "${dataDir}/graphite:/app/data" \
                --read-only -v /tmp -v /run "${tag}"`;

    shell.execSync('startGraphite', cmd);

    callback();
}

function startMysql(callback) {
    const tag = infra.images.mysql.tag;
    const dataDir = paths.DATA_DIR;
    const rootPassword = hat(8 * 128);

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/mysql_vars.sh', 
            'MYSQL_ROOT_PASSWORD=' + rootPassword +'\nMYSQL_ROOT_HOST=172.18.0.1', 'utf8')) {
        return callback(new Error('Could not create mysql var file:' + safe.error.message));
    }

    const cmd = `docker run --restart=always -d --name="mysql" \
                --net cloudron \
                --net-alias mysql \
                -m 256m \
                --memory-swap 512m \
                -v "${dataDir}/mysql:/var/lib/mysql" \
                -v "${dataDir}/addons/mysql_vars.sh:/etc/mysql/mysql_vars.sh:ro" \
                --read-only -v /tmp -v /run "${tag}"`;

    shell.execSync('startMysql', cmd);

    callback();
}

function startPostgresql(callback) {
    const tag = infra.images.postgresql.tag;
    const dataDir = paths.DATA_DIR;
    const rootPassword = hat(8 * 128);

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/postgresql_vars.sh', 'POSTGRESQL_ROOT_PASSWORD=' + rootPassword, 'utf8')) {
        return callback(new Error('Could not create postgresql var file:' + safe.error.message));
    }

    const cmd = `docker run --restart=always -d --name="postgresql" \
                --net cloudron \
                --net-alias postgresql \
                -m 256m \
                --memory-swap 512m \
                -v "${dataDir}/postgresql:/var/lib/postgresql" \
                -v "${dataDir}/addons/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh:ro" \
                --read-only -v /tmp -v /run "${tag}"`;

    shell.execSync('startPostgresql', cmd);

    callback();
}

function startMongodb(callback) {
    const tag = infra.images.mongodb.tag;
    const dataDir = paths.DATA_DIR;
    const rootPassword = hat(8 * 128);

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/mongodb_vars.sh', 'MONGODB_ROOT_PASSWORD=' + rootPassword, 'utf8')) {
        return callback(new Error('Could not create mongodb var file:' + safe.error.message));
    }

    const cmd = `docker run --restart=always -d --name="mongodb" \
                --net cloudron \
                --net-alias mongodb \
                -m 100m \
                --memory-swap 200m \
                -v "${dataDir}/mongodb:/var/lib/mongodb" \
                -v "${dataDir}/addons/mongodb_vars.sh:/etc/mongodb_vars.sh:ro" \
                --read-only -v /tmp -v /run "${tag}"`;

    shell.execSync('startMongodb', cmd);

    callback();
}

function startMail(callback) {
    // mail (note: 2525 is hardcoded in mail container and app use this port)
    // MAIL_SERVER_NAME is the hostname of the mailserver i.e server uses these certs
    // MAIL_DOMAIN is the domain for which this server is relaying mails
    // mail container uses /app/data for backed up data and /run for restart-able data

    const tag = infra.images.mail.tag;
    const dataDir = paths.DATA_DIR;
    const rootPassword = hat(8 * 128);
    const fqdn = config.fqdn();
    const mailFqdn = config.adminFqdn();

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/mail_vars.sh',
            'MAIL_ROOT_USERNAME=no-reply\nMAIL_ROOT_PASSWORD=' + rootPassword, 'utf8')) {
        return callback(new Error('Could not create mail var file:' + safe.error.message));
    }

    // TODO: watch for a signal here should the certificate path change. Note that haraka reloads
    // config automatically if the contents of the certificate changes (eg, renawal).
    certificates.getAdminCertificatePath(function (error, certFilePath, keyFilePath) {
        if (error) return callback(error);

        settings.getMailConfig(function (error, mailConfig) {
            if (error) return callback(error);

            shell.execSync('startMail', 'docker rm -f mail || true');

            var ports = mailConfig.enabled ? '-p 587:2525 -p 993:9993 -p 4190:4190 -p 25:2525' : '';

            const cmd = `docker run --restart=always -d --name="mail" \
                        --net cloudron \
                        --net-alias mail \
                        -m 128m \
                        --memory-swap 256m \
                        -e "MAIL_DOMAIN=${fqdn}" \
                        -e "MAIL_SERVER_NAME=${mailFqdn}" \
                        -v "${dataDir}/box/mail:/app/data" \
                        -v "${dataDir}/mail:/run" \
                        -v "${dataDir}/addons/mail_vars.sh:/etc/mail/mail_vars.sh:ro" \
                        -v "${certFilePath}:/etc/tls_cert.pem:ro" \
                        -v "${keyFilePath}:/etc/tls_key.pem:ro" \
                        ${ports} \
                        --read-only -v /tmp ${tag}`;

            shell.execSync('startMail', cmd);

            mailboxes.setupAliases(function (error) {
                if (error) return callback(error);

                if (!mailConfig.enabled || process.env.BOX_ENV === 'test') return callback();

                // Add MX record
                var mxRecord = { subdomain: '', type: 'MX', values: [ '10 ' + config.mailFqdn() + '.' ] };
                subdomains.update(mxRecord.subdomain, mxRecord.type, mxRecord.values, callback);
            });
        });
    });
}

function startAddons(existingInfra, callback) {
    var startFuncs = [ ];

    if (existingInfra.version !== infra.version) {
        debug('startAddons: no existing infra or infra upgrade. starting all addons');
        startFuncs.push(startGraphite, startMysql, startPostgresql, startMongodb, startMail);
    } else {
        assert.strictEqual(typeof existingInfra.images, 'object');

        if (infra.images.graphite.tag !== existingInfra.images.graphite.tag) startFuncs.push(startGraphite);
        if (infra.images.mysql.tag !== existingInfra.images.mysql.tag) startFuncs.push(startMysql);
        if (infra.images.postgresql.tag !== existingInfra.images.postgresql.tag) startFuncs.push(startPostgresql);
        if (infra.images.mongodb.tag !== existingInfra.images.mongodb.tag) startFuncs.push(startMongodb);
        if (infra.images.mail.tag !== existingInfra.images.mail.tag) startFuncs.push(startMail);

        debug('startAddons: existing infra. incremental addon create %j', startFuncs.map(function (f) { return f.name; }));
    }

    async.series(startFuncs, callback);
}

function startApps(existingInfra, callback) {
    if (existingInfra.version === infra.version) {
        debug('startApp: apps are already uptodate');
        callback();
    } else if (existingInfra.version === 'none') {
        debug('startApps: restoring installed apps');
        apps.restoreInstalledApps(callback);
    } else {
        debug('startApps: reconfiguring installed apps');
        apps.configureInstalledApps(callback);
    }
}

