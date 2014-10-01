/* jslint node: true */

'use strict';

var nodemailer = require('nodemailer'),
    smtpTransport = require('nodemailer-smtp-transport'),
    debug = require('debug')('box:mailer'),
    assert = require('assert'),
    aync = require('async'),
    config = require('../config.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    adminAdded: adminAdded,
    userAdded: userAdded,
    userRemoved: userRemoved,
    adminChanged: adminChanged
};

var transport = nodemailer.createTransport(smtpTransport({
    host: config.mailServer,
    port: 25
}));

var mailQueue = [ ],
    mailQueueTimerId = null;

function initialize() {
    mailQueueTimerId = setTimeout(processQueue, 60000);
}

function uninitialize() {
    // TODO: interrupt processQueue as well
    clearTimeout(mailQueueTimerId);
    mailQueueTimerId = null;

    console.log(mailQueue.length + ' mail items dropped');
    mailQueue = [ ];
}

function processQueue() {
    var mailQueueCopy = mailQueue;
    mailQueue = [ ];

    async.series(mailQueueCopy, function iterator(mailOptions, callback) {
        transport.sendMail(mailOptions, function (error, info) {
            if (error) return console.error(error);

            debug('Email sent to ' + user.email);
        });
        callback(null);
    }, function done() {
        mailQueueTimerId = setTimeout(processQueue, 60000);
    });
}

function enqueue(mailOptions) {
    assert(typeof mailOptions === 'object');
    debug('Queued mail for ' + mailOptions.from + ' to ' + mailOptions.to);
    mailQueue.push(mailOptions);
}

function adminAdded(user) {
    debug('Sending mail for adminAdded');

    var mailOptions = {
        from: config.mailUsername,
        to: user.email,
        subject: 'Welcome to Cloudron',
        text: 'You can check out anytime you like, but you can never leave',
        html: 'You can check out <i>anytime</i> you like, but you can <i>never</i> leave'
    };

    enqueue(mailOptions);
}

function userAdded(user) {
    debug('Sending mail for userAdded');
}

function userRemoved(user) {
    debug('Sending mail for userRemoved');
}

function adminChanged(user) {
    debug('Sending mail for adminChanged');
}

