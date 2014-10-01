/* jslint node: true */

'use strict';

var nodemailer = require('nodemailer'),
    smtpTransport = require('nodemailer-smtp-transport'),
    debug = require('debug')('box:mailer'),
    config = require('../config.js');

exports = module.exports = {
    adminAdded: adminAdded,
    userAdded: userAdded,
    userRemoved: userRemoved,
    adminChanged: adminChanged
};

var transport = nodemailer.createTransport(smtpTransport({
    host: config.mailServer,
    port: 25
}));

function adminAdded(user) {
    debug('Sending mail for adminAdded');

    var mailOptions = {
        from: config.mailUsername,
        to: user.email,
        subject: 'Welcome to Cloudron',
        text: 'You can check out anytime you like, but you can never leave',
        html: 'You can check out <i>anytime</i> you like, but you can <i>never</i> leave'
    };

    transport.sendMail(mailOptions, function (error, info) {
        if (error) return console.error(error);

        debug('Email sent to ' + user.email);
    });
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

