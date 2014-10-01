/* jslint node: true */

'use strict';

var nodemailer = require('nodemailer'),
    smtpTransport = require('nodemailer-smtp-transport'),
    debug = require('debug')('mailer'),
    config = require('../config.js');

exports = module.exports = {
    sendWelcome: sendWelcome
};

var transport = nodemailer.createTransport(smtpTransport({
    host: config.mailServer,
    port: 25
}));

function sendWelcome(user) {
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

