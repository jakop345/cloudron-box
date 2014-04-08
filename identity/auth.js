'use strict';

/*
 Contains the various login methods like basic and bearer tokens
 */

var passport = require('passport'),
    LocalStrategy = require('passport-local').Strategy,
    BasicStrategy = require('passport-http').BasicStrategy,
    ClientPasswordStrategy = require('passport-oauth2-client-password').Strategy,
    BearerStrategy = require('passport-http-bearer').Strategy,
    debug = require('debug')('authserver:auth'),
    DatabaseError = require('./databaseerror'),
    clientdb = require('./clientdb'),
    tokendb = require('./tokendb'),
    userdb = require('./userdb');


// helpers for session de/serializing
passport.serializeUser(function (user, callback) {
    debug('serializeUser: ' + JSON.stringify(user));

    callback(null, user.id);
});

passport.deserializeUser(function(id, callback) {
    debug('deserializeUser: ' + id);

    userdb.get(id, function (error, user) {
      callback(error, user);
    });
});


/**
 * LocalStrategy
 *
 * This strategy is used to authenticate users based on a username and password.
 * Anytime a request is made to authorize an application, we must ensure that
 * a user is logged in before asking them to approve the request.
 */
passport.use(new LocalStrategy(function (username, password, callback) {
    debug('LocalStrategy: ' + username + ' ' + password);

    userdb.getByUsername(username, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) return callback(error);
        if (user.password !== password) return callback(null, false);
        callback(null, userdb.removePrivates(user));
    });
}));


/**
 * BasicStrategy & ClientPasswordStrategy
 *
 * These strategies are used to authenticate registered OAuth clients.  They are
 * employed to protect the `token` endpoint, which consumers use to obtain
 * access tokens.  The OAuth 2.0 specification suggests that clients use the
 * HTTP Basic scheme to authenticate.  Use of the client password strategy
 * allows clients to send the same credentials in the request body (as opposed
 * to the `Authorization` header).  While this approach is not recommended by
 * the specification, in practice it is quite common.
 */
passport.use(new BasicStrategy(function (username, password, callback) {
    debug('BasicStrategy: ' + username + ' ' + password);

    // username is actually client id here
    // password is client secret
    clientdb.get(username, function (error, client) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) return callback(error);
        if (client.clientSecret != password) return callback(null, false);
        return callback(null, client);
    });
}));

passport.use(new ClientPasswordStrategy(function (clientId, clientSecret, callback) {
    debug('ClientPasswordStrategy: ' + clientId + ' ' + clientSecret);

    clientdb.get(clientId, function(error, client) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) { return callback(error); }
        if (client.clientSecret != clientSecret) { return callback(null, false); }
        return callback(null, client);
    });
}));

/**
 * BearerStrategy
 *
 * This strategy is used to authenticate users based on an access token (aka a
 * bearer token).  The user must have previously authorized a client
 * application, which is issued an access token to make requests on behalf of
 * the authorizing user.
 */
passport.use(new BearerStrategy(function (accessToken, callback) {
    debug('BearerStrategy: ' + accessToken);

    tokendb.get(accessToken, function (error, token) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) return callback(error);

        userdb.get(token.userId, function (error, user) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
            if (error) return callback(error);

            // scopes here can define what capabilities that token carries
            var info = { scope: '*' };
            callback(null, userdb.removePrivates(user), info);
        });
    });
}));
