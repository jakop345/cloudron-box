'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    userAdded: userAdded,
    userRemoved: userRemoved,
    adminChanged: adminChanged,
    passwordReset: passwordReset,
    boxUpdateAvailable: boxUpdateAvailable,
    appUpdateAvailable: appUpdateAvailable,

    sendInvite: sendInvite,
    unexpectedExit: unexpectedExit,

    appDied: appDied,

    outOfDiskSpace: outOfDiskSpace,

    certificateRenewed: certificateRenewed,

    FEEDBACK_TYPE_FEEDBACK: 'feedback',
    FEEDBACK_TYPE_TICKET: 'ticket',
    FEEDBACK_TYPE_APP_MISSING: 'app_missing',
    FEEDBACK_TYPE_APP_ERROR: 'app_error',
    FEEDBACK_TYPE_UPGRADE_REQUEST: 'upgrade_request',
    sendFeedback: sendFeedback,

    _getMailQueue: _getMailQueue,
    _clearMailQueue: _clearMailQueue
};

var assert = require('assert'),
    async = require('async'),
    cloudron = require('./cloudron.js'),
    config = require('./config.js'),
    debug = require('debug')('box:mailer'),
    dns = require('native-dns'),
    docker = require('./docker.js').connection,
    ejs = require('ejs'),
    nodemailer = require('nodemailer'),
    path = require('path'),
    platform = require('./platform.js'),
    safe = require('safetydance'),
    smtpTransport = require('nodemailer-smtp-transport'),
    users = require('./user.js'),
    util = require('util'),
    _ = require('underscore');

var MAIL_TEMPLATES_DIR = path.join(__dirname, 'mail_templates');

var gMailQueue = [ ],
    gDnsReady = false,
    gCheckDnsTimerId = null;

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (cloudron.isConfiguredSync()) {
        checkDns();
    } else {
        cloudron.events.on(cloudron.EVENT_CONFIGURED, checkDns);
    }

    callback(null);
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    cloudron.events.removeListener(cloudron.EVENT_CONFIGURED, checkDns);

    // TODO: interrupt processQueue as well
    clearTimeout(gCheckDnsTimerId);
    gCheckDnsTimerId = null;

    debug(gMailQueue.length + ' mail items dropped');
    gMailQueue = [ ];

    callback(null);
}

function getTxtRecords(callback) {
    dns.resolveNs(config.zoneName(), function (error, nameservers) {
        if (error || !nameservers) return callback(error || new Error('Unable to get nameservers'));

        var nameserver = nameservers[0];

        dns.resolve4(nameserver, function (error, nsIps) {
            if (error || !nsIps || nsIps.length === 0) return callback(error);

            var req = dns.Request({
                question: dns.Question({ name: config.fqdn(), type: 'TXT' }),
                server: { address: nsIps[0] },
                timeout: 5000
            });

            req.on('timeout', function () { return callback(new Error('ETIMEOUT')); });

            req.on('message', function (error, message) {
                if (error || !message.answer || message.answer.length === 0) return callback(null, null);

                var records = message.answer.map(function (a) { return a.data[0]; });
                callback(null, records);
            });

            req.send();
        });
    });
}

// keep this in sync with the cloudron.js dns changes
function checkDns() {
    getTxtRecords(function (error, records) {
        if (error || !records) {
            debug('checkDns: DNS error or no records looking up TXT records for %s %s', config.adminFqdn(), error, records);
            gCheckDnsTimerId = setTimeout(checkDns, 60000);
            return;
        }

        var allowedToSendMail = false;

        for (var i = 0; i < records.length; i++) {
            if (records[i].indexOf('v=spf1 ') !== 0) continue; // not SPF

            allowedToSendMail = records[i].indexOf('a:' + config.adminFqdn()) !== -1;
            break; // only one SPF record can exist (https://support.google.com/a/answer/4568483?hl=en)
        }

        if (!allowedToSendMail) {
            debug('checkDns: SPF records disallow sending email from cloudron. %j', records);
            gCheckDnsTimerId = setTimeout(checkDns, 60000);
            return;
        }

        debug('checkDns: SPF check passed. commencing mail processing');
        gDnsReady = true;
        processQueue();
    });
}

function processQueue() {
    assert(gDnsReady);

    sendMails(gMailQueue);
    gMailQueue = [ ];
}

// note : this function should NOT access the database. it is called by the crashnotifier
// which does not initialize mailer or the databse
function sendMails(queue) {
    assert(util.isArray(queue));

    docker.getContainer('mail').inspect(function (error, data) {
        if (error) return console.error(error);

        var mailServerIp = safe.query(data, 'NetworkSettings.IPAddress');
        if (!mailServerIp) return debug('Error querying mail server IP');

        var transport = nodemailer.createTransport(smtpTransport({
            host: mailServerIp,
            port: config.get('smtpPort'),
            auth: {
                user: platform.mailConfig().username,
                pass: platform.mailConfig().password
            }
        }));

        debug('Processing mail queue of size %d (through %s:2525)', queue.length, mailServerIp);

        async.mapSeries(queue, function iterator(mailOptions, callback) {
            transport.sendMail(mailOptions, function (error) {
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
    assert.strictEqual(typeof mailOptions, 'object');

    if (!mailOptions.from) console.error('sender address is missing');
    if (!mailOptions.to) console.error('recipient address is missing');

    debug('Queued mail for ' + mailOptions.from + ' to ' + mailOptions.to);
    gMailQueue.push(mailOptions);

    if (gDnsReady) processQueue();
}

function render(templateFile, params) {
    assert.strictEqual(typeof templateFile, 'string');
    assert.strictEqual(typeof params, 'object');

    return ejs.render(safe.fs.readFileSync(path.join(MAIL_TEMPLATES_DIR, templateFile), 'utf8'), params);
}

function getAdminEmails(callback) {
    users.getAllAdmins(function (error, admins) {
        if (error) return callback(error);

        if (admins.length === 0) return callback(new Error('No admins on this cloudron')); // box not activated yet

        var adminEmails = [ ];
        admins.forEach(function (admin) { adminEmails.push(admin.email); });

        callback(null, adminEmails);
    });
}

function mailUserEventToAdmins(user, event) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof event, 'string');

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

        adminEmails = _.difference(adminEmails, [ user.email ]);

        var mailOptions = {
            from: platform.mailConfig().from,
            to: adminEmails.join(', '),
            subject: util.format('%s %s in Cloudron %s', user.username || user.email, event, config.fqdn()),
            text: render('user_event.ejs', { fqdn: config.fqdn(), user: user, event: event, format: 'text' }),
        };

        enqueue(mailOptions);
    });
}

function sendInvite(user, invitor) {
    assert.strictEqual(typeof user, 'object');
    assert(typeof invitor === 'object');

    debug('Sending invite mail');

    var templateData = {
        user: user,
        webadminUrl: config.adminOrigin(),
        setupLink: config.adminOrigin() + '/api/v1/session/account/setup.html?reset_token=' + user.resetToken,
        format: 'text',
        fqdn: config.fqdn(),
        invitor: invitor
    };

    var mailOptions = {
        from: platform.mailConfig().from,
        to: user.email,
        subject: util.format('Welcome to Cloudron %s', config.fqdn()),
        text: render('welcome_user.ejs', templateData)
    };

    enqueue(mailOptions);
}

function userAdded(user, inviteSent) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof inviteSent, 'boolean');

    debug('Sending mail for userAdded %s including invite link', inviteSent ? 'not' : '');

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

        adminEmails = _.difference(adminEmails, [ user.email ]);

        var inviteLink = inviteSent ? null : config.adminOrigin() + '/api/v1/session/account/setup.html?reset_token=' + user.resetToken;

        var mailOptions = {
            from: platform.mailConfig().from,
            to: adminEmails.join(', '),
            subject: util.format('%s added in Cloudron %s', user.email, config.fqdn()),
            text: render('user_added.ejs', { fqdn: config.fqdn(), user: user, inviteLink: inviteLink, format: 'text' }),
        };

        enqueue(mailOptions);
    });
}

function userRemoved(user) {
    assert.strictEqual(typeof user, 'object');

    debug('Sending mail for userRemoved.', user.id, user.email);

    mailUserEventToAdmins(user, 'was removed');
}

function adminChanged(user, admin) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof admin, 'boolean');

    debug('Sending mail for adminChanged');

    mailUserEventToAdmins(user, admin ? 'is now an admin' : 'is no more an admin');
}

function passwordReset(user) {
    assert.strictEqual(typeof user, 'object');

    debug('Sending mail for password reset for user %s.', user.email, user.id);

    var resetLink = config.adminOrigin() + '/api/v1/session/password/reset.html?reset_token=' + user.resetToken;

    var mailOptions = {
        from: platform.mailConfig().from,
        to: user.email,
        subject: 'Password Reset Request',
        text: render('password_reset.ejs', { fqdn: config.fqdn(), user: user, resetLink: resetLink, format: 'text' })
    };

    enqueue(mailOptions);
}

function appDied(app) {
    assert.strictEqual(typeof app, 'object');

    debug('Sending mail for app %s @ %s died', app.id, app.location);

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

        var mailOptions = {
            from: platform.mailConfig().from,
            to: adminEmails.concat('support@cloudron.io').join(', '),
            subject: util.format('App %s is down', app.location),
            text: render('app_down.ejs', { fqdn: config.fqdn(), title: app.manifest.title, appFqdn: config.appFqdn(app.location), format: 'text' })
        };

        enqueue(mailOptions);
    });
}

function boxUpdateAvailable(newBoxVersion, changelog) {
    assert.strictEqual(typeof newBoxVersion, 'string');
    assert(util.isArray(changelog));

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

         var mailOptions = {
            from: platform.mailConfig().from,
            to: adminEmails.join(', '),
            subject: util.format('%s has a new update available', config.fqdn()),
            text: render('box_update_available.ejs', { fqdn: config.fqdn(), webadminUrl: config.adminOrigin(), newBoxVersion: newBoxVersion, changelog: changelog, format: 'text' })
        };

        enqueue(mailOptions);
    });
}

function appUpdateAvailable(app, updateInfo) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof updateInfo, 'object');

    getAdminEmails(function (error, adminEmails) {
        if (error) return console.log('Error getting admins', error);

         var mailOptions = {
            from: platform.mailConfig().from,
            to: adminEmails.join(', '),
            subject: util.format('%s has a new update available', app.fqdn),
            text: render('app_update_available.ejs', { fqdn: config.fqdn(), webadminUrl: config.adminOrigin(), app: app, updateInfo: updateInfo, format: 'text' })
        };

        enqueue(mailOptions);
    });
}

function outOfDiskSpace(message) {
    assert.strictEqual(typeof message, 'string');

    var mailOptions = {
        from: platform.mailConfig().from,
        to: 'admin@cloudron.io',
        subject: util.format('[%s] Out of disk space alert', config.fqdn()),
        text: render('out_of_disk_space.ejs', { fqdn: config.fqdn(), message: message, format: 'text' })
    };

    sendMails([ mailOptions ]);
}

function certificateRenewed(domain, message) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof message, 'string');

    var mailOptions = {
        from: platform.mailConfig().from,
        to: 'admin@cloudron.io',
        subject: util.format('[%s] Certificate was %s renewed', domain, message ? 'not' : ''),
        text: render('certificate_renewed.ejs', { domain: domain, message: message, format: 'text' })
    };

    sendMails([ mailOptions ]);
}

// this function bypasses the queue intentionally. it is also expected to work without the mailer module initialized
// crashnotifier should be able to send mail when there is no db
function unexpectedExit(program, context) {
    assert.strictEqual(typeof program, 'string');
    assert.strictEqual(typeof context, 'string');

    var mailOptions = {
        from: platform.mailConfig().from,
        to: 'admin@cloudron.io',
        subject: util.format('[%s] %s exited unexpectedly', config.fqdn(), program),
        text: render('unexpected_exit.ejs', { fqdn: config.fqdn(), program: program, context: context, format: 'text' })
    };

    sendMails([ mailOptions ]);
}

function sendFeedback(user, type, subject, description) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof subject, 'string');
    assert.strictEqual(typeof description, 'string');

    assert(type === exports.FEEDBACK_TYPE_TICKET ||
        type === exports.FEEDBACK_TYPE_FEEDBACK ||
        type === exports.FEEDBACK_TYPE_APP_MISSING ||
        type === exports.FEEDBACK_TYPE_UPGRADE_REQUEST ||
        type === exports.FEEDBACK_TYPE_APP_ERROR);

    var mailOptions = {
        from: platform.mailConfig().from,
        to: 'support@cloudron.io',
        subject: util.format('[%s] %s - %s', type, config.fqdn(), subject),
        text: render('feedback.ejs', { fqdn: config.fqdn(), type: type, user: user, subject: subject, description: description, format: 'text'})
    };

    enqueue(mailOptions);
}

function _getMailQueue() {
    return gMailQueue;
}

function _clearMailQueue(callback) {
    gMailQueue = [];

    if (callback) callback();
}
