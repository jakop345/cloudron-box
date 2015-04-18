/* jslint node: true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    cloudron = require('./cloudron.js'),
    config = require('../config.js'),
    debug = require('debug')('box:mailer'),
    digitalocean = require('./digitalocean.js'),
    docker = require('./docker.js'),
    ejs = require('ejs'),
    nodemailer = require('nodemailer'),
    path = require('path'),
    safe = require('safetydance'),
    smtpTransport = require('nodemailer-smtp-transport'),
    userdb = require('./userdb.js'),
    util = require('util'),
    _ = require('underscore');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    userAdded: userAdded,
    userRemoved: userRemoved,
    adminChanged: adminChanged,
    passwordReset: passwordReset,
    boxUpdateAvailable: boxUpdateAvailable,

    appDied: appDied
};

var MAIL_TEMPLATES_DIR = path.join(__dirname, 'mail_templates');

var gMailQueue = [ ],
    gDnsReady = false,
    gCheckDnsTimerId = null;

function initialize(callback) {
    assert(typeof callback === 'function');

    checkDns();
    callback(null);
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    // TODO: interrupt processQueue as well
    clearTimeout(gCheckDnsTimerId);
    gCheckDnsTimerId = null;

    debug(gMailQueue.length + ' mail items dropped');
    gMailQueue = [ ];

    callback(null);
}

function checkDns() {
    digitalocean.checkPtrRecord(cloudron.getIp(), config.fqdn(), function (error, ok) {
        if (error || !ok) {
            debug('PTR record not setup yet');
            gCheckDnsTimerId = setTimeout(checkDns, 10000);
            return;
        }

        gDnsReady = true;
        processQueue();
    });
}

function processQueue() {
    docker.getContainer('mail').inspect(function (error, data) {
        if (error) {
            if (config.LOCAL) debug('No mail container found. This is ok in LOCAL mode.');
            else console.error(error);
            return;
        }

        var mailServerIp = safe.query(data, 'NetworkSettings.IPAddress');
        if (!mailServerIp) return debug('Error querying mail server IP');

        var transport = nodemailer.createTransport(smtpTransport({
            host: mailServerIp,
            port: 25
        }));

        var mailQueueCopy = gMailQueue;
        gMailQueue = [ ];

        debug('Processing mail queue of size %d', mailQueueCopy.length);

        async.mapSeries(mailQueueCopy, function iterator(mailOptions, callback) {
            transport.sendMail(mailOptions, function (error, info) {
                if (error) return console.error(error); // TODO: requeue?
                debug('Email sent to ' + mailOptions.to);
            });
            callback(null);
        }, function done() {
            debug('Done processing mail queue');
        });
    });
}

function enqueue(mailOptions) {
    assert(typeof mailOptions === 'object');

    debug('Queued mail for ' + mailOptions.from + ' to ' + mailOptions.to);
    gMailQueue.push(mailOptions);

    if (config.LOCAL) debug('Print email in local mode:', mailOptions);

    if (gDnsReady) processQueue();
}

function render(templateFile, params) {
    assert(typeof templateFile === 'string');
    assert(typeof params === 'object');

    return ejs.render(safe.fs.readFileSync(path.join(MAIL_TEMPLATES_DIR, templateFile), 'utf8'), params);
}

function getAdminEmails(callback) {
    userdb.getAllAdmins(function (error, admins) {
        if (error) return callback(error);

        var adminEmails = [ ];
        admins.forEach(function (admin) { adminEmails.push(admin.email); });

        callback(null, adminEmails);
    });
}

function mailUserEventToAdmins(user, event) {
    assert(typeof user === 'object');
    assert(typeof event === 'string');

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

        adminEmails = _.difference(adminEmails, [ user.email ]);

        var mailOptions = {
            from: config.get('mailUsername'),
            to: adminEmails.join(', '),
            subject: util.format('%s %s in Cloudron %s', user.username, event, config.fqdn()),
            text: render('user_event.ejs', { fqdn: config.fqdn(), username: user.username, email: user.email, event: event, format: 'text' }),
        };

        enqueue(mailOptions);
    });
}

function userAdded(user) {
    assert(typeof user === 'object');

    debug('Sending mail for userAdded');

    var templateData = {
        user: user,
        webadminUrl: config.adminOrigin(),
        setupLink: config.adminOrigin() + '/api/v1/session/password/setup.html?reset_token=' + user.resetToken,
        format: 'text',
        fqdn: config.fqdn()
    };

    var mailOptions = {
        from: config.get('mailUsername'),
        to: user.email,
        subject: util.format('Welcome to Cloudron %s', config.fqdn()),
        text: render('welcome_user.ejs', templateData)
    };

    enqueue(mailOptions);

    mailUserEventToAdmins(user, 'was added');
}

function userRemoved(username) {
    assert(typeof username === 'string');

    debug('Sending mail for userRemoved');

    mailUserEventToAdmins({ username: username }, 'was removed');
}

function adminChanged(user) {
    assert(typeof user === 'object');

    debug('Sending mail for adminChanged');

    mailUserEventToAdmins(user, user.admin ? 'is now an admin' : 'is no more an admin');
}

function passwordReset(user) {
    assert(typeof user === 'object');

    debug('Sending mail for password reset for user %s.', user.username);

    var resetLink = config.adminOrigin() + '/api/v1/session/password/reset.html?reset_token=' + user.resetToken;

    var mailOptions = {
        from: config.get('mailUsername'),
        to: user.email,
        subject: 'Password Reset Request',
        text: render('password_reset.ejs', { fqdn: config.fqdn(), username: user.username, resetLink: resetLink, format: 'text' })
    };

    enqueue(mailOptions);
}

function appDied(app) {
    assert(typeof app === 'object');

    debug('Sending mail for app %s @ %s died', app.id, app.location);

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

        var mailOptions = {
            from: config.get('mailUsername'),
            to: adminEmails.join(', '),
            subject: util.format('App %s is down', app.location),
            text: render('app_down.ejs', { fqdn: config.fqdn(), title: app.manifest.title, appFqdn: config.appFqdn(app.location), format: 'text' })
        };

        enqueue(mailOptions);
    });
}

function boxUpdateAvailable(newBoxVersion, changelog) {
    assert(typeof newBoxVersion === 'string');
    assert(util.isArray(changelog));

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

         var mailOptions = {
            from: config.get('mailUsername'),
            to: adminEmails.join(', '),
            subject: util.format('%s has a new update available', config.fqdn()),
            text: render('box_update_available.ejs', { fqdn: config.fqdn(), newBoxVersion: newBoxVersion, changelog: changelog, format: 'text' })
        };

        enqueue(mailOptions);
    });
}

