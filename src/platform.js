'use strict';

exports = module.exports = {
    initialize: initialize,

    mailConfig: mailConfig
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
    ini = require('ini'),
    mailboxes = require('./mailboxes.js'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    util = require('util');

var gAddonVars = null;

function initialize(callback) {
    if (process.env.BOX_ENV === 'test' && !process.env.CREATE_INFRA) return callback();

    debug('initializing addon infrastructure');

    var existingInfra = { version: 'none' };
    if (fs.existsSync(paths.INFRA_VERSION_FILE)) {
        existingInfra = safe.JSON.parse(fs.readFileSync(paths.INFRA_VERSION_FILE, 'utf8'));
        if (!existingInfra) existingInfra = { version: 'legacy' };
    }

    if (infra.version === existingInfra.version) {
        debug('platform is uptodate at version %s', infra.version);
        return loadAddonVars(callback);
    }

    debug('Updating infrastructure from %s to %s', existingInfra.version, infra.version);

    async.series([
        stopContainers,
        startAddons,
        removeOldImages,
        existingInfra.version === 'none' ? apps.restoreInstalledApps : apps.configureInstalledApps,
        loadAddonVars,
        mailboxes.setupAliases,
        fs.writeFile.bind(fs, paths.INFRA_VERSION_FILE, JSON.stringify(infra))
    ], callback);
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

function stopContainers(callback) {
    // TODO: be nice and stop addons cleanly (example, shutdown commands)
    debug('stopping existing containers');
    shell.execSync('stopContainersSync', 'docker ps -qa | xargs --no-run-if-empty docker rm -f');
    callback();
}

function startGraphite(callback) {
    const tag = infra.images.graphite.tag;
    const dataDir = paths.DATA_DIR;

    const cmd = `docker run --restart=always -d --name="graphite" \
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
    const rootPassword = hat(256);

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/mysql_vars.sh',
            'MYSQL_ROOT_PASSWORD=' + rootPassword +'\nMYSQL_ROOT_HOST=172.17.0.1', 'utf8')) {
        return callback(new Error('Could not create mysql var file:' + safe.error.message));
    }

    const cmd = `docker run --restart=always -d --name="mysql" \
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
    const rootPassword = hat(256);

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/postgresql_vars.sh', 'POSTGRESQL_ROOT_PASSWORD=' + rootPassword, 'utf8')) {
        return callback(new Error('Could not create postgresql var file:' + safe.error.message));
    }

    const cmd = `docker run --restart=always -d --name="postgresql" \
                -m 100m \
                --memory-swap 200m \
                -v "${dataDir}/postgresql:/var/lib/postgresql" \
                -v "${dataDir}/addons/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh:ro" \
                --read-only -v /tmp -v /run "${tag}"`;

    shell.execSync('startPostgresql', cmd);

    callback();
}

function startMongodb(callback) {
    const tag = infra.images.mongodb.tag;
    const dataDir = paths.DATA_DIR;
    const rootPassword = hat(256);

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/mongodb_vars.sh', 'MONGODB_ROOT_PASSWORD=' + rootPassword, 'utf8')) {
        return callback(new Error('Could not create mongodb var file:' + safe.error.message));
    }

    const cmd = `docker run --restart=always -d --name="mongodb" \
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
    const rootPassword = hat(256);
    const fqdn = config.fqdn();
    const mailFqdn = config.adminFqdn();

    if (!safe.fs.writeFileSync(paths.DATA_DIR + '/addons/mail_vars.sh',
            'MAIL_ROOT_USERNAME=no-reply\nMAIL_ROOT_PASSWORD=' + rootPassword, 'utf8')) {
        return callback(new Error('Could not create mail var file:' + safe.error.message));
    }

    certificates.getAdminCertificatePath(function (error, certFilePath, keyFilePath) {
        if (error) return callback(error);

        const cmd = `docker run --restart=always -d --name="mail" \
                    -m 75m \
                    --memory-swap 150m \
                    -e "MAIL_DOMAIN=${fqdn}" \
                    -e "MAIL_SERVER_NAME=${mailFqdn}" \
                    -v "${dataDir}/box/mail:/app/data" \
                    -v "${dataDir}/mail:/run" \
                    -v "${dataDir}/addons/mail_vars.sh:/etc/mail/mail_vars.sh:ro" \
                    -v "${certFilePath}:/etc/tls_cert.pem:ro" \
                    -v "${keyFilePath}:/etc/tls_key.pem:ro" \
                    -p 587:2525 \
                    -p 993:9993 \
                    -p 4190:4190 \
                    -p 25:2525 \
                    --read-only -v /tmp ${tag}`;

        shell.execSync('startMongodb', cmd);

        callback();
    });
}

function startAddons(callback) {
    assert.strictEqual(typeof callback, 'function');

    async.series([
        startGraphite,
        startMysql,
        startPostgresql,
        startMongodb,
        startMail
    ], callback);
}

function loadAddonVars(callback) {
    gAddonVars = {
        mail: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/mail_vars.sh', 'utf8')),
        postgresql: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/postgresql_vars.sh', 'utf8')),
        mysql: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/mysql_vars.sh', 'utf8')),
        mongodb: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/mongodb_vars.sh', 'utf8'))
    };
    callback();
}

function mailConfig() {
    if (!gAddonVars) return { username: 'no-reply', from: 'no-reply@' + config.fqdn(), password: 'doesnotwork' }; // for tests which don't run infra

    return {
        username: gAddonVars.mail.MAIL_ROOT_USERNAME,
        from: '"Cloudron" <' + gAddonVars.mail.MAIL_ROOT_USERNAME + '@' + config.fqdn() + '>',
        password: gAddonVars.mail.MAIL_ROOT_PASSWORD
    };
}
