'use strict';

/*
 Contains the needed UI elements for the oauth2 dialogs
 */

var passport = require('passport'),
    login = require('connect-ensure-login');

exports.loginForm = function(req, res) {
    res.render('login');
};

exports.login = passport.authenticate('local', { successReturnToOrRedirect: '/api/v1/session/account', failureRedirect: '/api/v1/session/login' });

exports.logout = function(req, res) {
    req.logout();
    res.redirect('/');
};

exports.account = [
    login.ensureLoggedIn('/api/v1/session/login'),
    function(req, res) {
        res.render('account', { user: req.user });
    }
];
