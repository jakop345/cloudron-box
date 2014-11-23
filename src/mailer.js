/* jslint node: true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    cloudron = require('./cloudron.js'),
    config = require('../config.js'),
    debug = require('debug')('box:mailer'),
    digitalocean = require('./digitalocean.js'),
    ejs = require('ejs'),
    nodemailer = require('nodemailer'),
    path = require('path'),
    safe = require('safetydance'),
    smtpTransport = require('nodemailer-smtp-transport'),
    userdb = require('./userdb.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    userAdded: userAdded,
    userRemoved: userRemoved,
    adminChanged: adminChanged,
    passwordReset: passwordReset
};

var MAIL_TEMPLATES_DIR = path.join(__dirname, 'mail_templates');

var gTransport = nodemailer.createTransport(smtpTransport({
    host: config.get('mailServer'),
    port: 25
}));

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
    var mailQueueCopy = gMailQueue;
    gMailQueue = [ ];

    debug('Processing mail queue of size %d', mailQueueCopy.length);

    async.mapSeries(mailQueueCopy, function iterator(mailOptions, callback) {
        gTransport.sendMail(mailOptions, function (error, info) {
            if (error) return console.error(error);

            debug('Email sent to ' + mailOptions.to);
        });
        callback(null);
    }, function done() {
        debug('Done processing mail queue');
    });
}

function enqueue(mailOptions) {
    assert(typeof mailOptions === 'object');
    debug('Queued mail for ' + mailOptions.from + ' to ' + mailOptions.to);
    gMailQueue.push(mailOptions);

    if (gDnsReady) processQueue();
}

function render(templateFile, params) {
    return ejs.render(safe.fs.readFileSync(path.join(MAIL_TEMPLATES_DIR, templateFile), 'utf8'), params);
}

function mailAdmins(user, event) {
    assert(typeof user === 'object');
    assert(typeof event === 'string');

    userdb.getAllAdmins(function (error, admins) {
        if (error) return console.log('Error getting admins', error);

        var adminEmails = [ ];
        admins.forEach(function (admin) { if (user.email !== admin.email) adminEmails.push(admin.email); });

        var mailOptions = {
            from: config.get('mailUsername'),
            to: adminEmails.join(', '),
            subject: 'User ' + event,
            text: render('user_text.ejs', { username: user.username, event: event }),
            html: render('user_html.ejs', { username: user.username, event: event })
        };

        enqueue(mailOptions);
    });
}

function userAdded(user, password) {
    debug('Sending mail for userAdded');

    var templateData = {
        user: user,
        password: password,
        webadminUrl: config.adminOrigin()
    };

    var mailOptions = {
        from: config.get('mailUsername'),
        to: user.email,
        subject: 'Welcome to Cloudron',
        text: render('welcome_text.ejs', templateData),
        html: render('welcome_html.ejs', templateData)
    };

    enqueue(mailOptions);

    mailAdmins(user, 'added');
}

function userRemoved(username) {
    debug('Sending mail for userRemoved');

    mailAdmins({ username: username }, 'removed');
}

function adminChanged(user) {
    debug('Sending mail for adminChanged');

    mailAdmins(user, user.admin ? 'made an admin' : 'removed as admin');
}

function passwordReset(user, token) {
    debug('Sending mail for password reset for user %s.', user.username);

    var resetLink = config.adminOrigin() + '/api/v1/session/password/reset.html?reset_token='+token;

    var mailOptions = {
        from: config.get('mailUsername'),
        to: user.email,
        subject: 'Password Reset Request',
        text: render('password_reset_text.ejs', { username: user.username, resetLink: resetLink }),
        html: render('password_reset_html.ejs', { username: user.username, resetLink: resetLink })
    };

    enqueue(mailOptions);
}
