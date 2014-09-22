/* jslint  node:true */

'use strict';

/*
 Contains the OAuth2 routes to get authcodes and exchange it for an access token
 */

var oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    assert = require('assert'),
    session = require('connect-ensure-login'),
    authcodedb = require('../authcodedb'),
    tokendb = require('../tokendb'),
    DatabaseError = require('../databaseerror'),
    HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    clientdb = require('../clientdb'),
    debug = require('debug')('box:routes/oauth2'),
    config = require('../../config.js'),
    uuid = require('node-uuid');

// create OAuth 2.0 server
var server = oauth2orize.createServer();

// Register serialialization and deserialization functions.
//
// When a client redirects a user to user authorization endpoint, an
// authorization transaction is initiated.  To complete the transaction, the
// user must authenticate and approve the authorization request.  Because this
// may involve multiple HTTP request/response exchanges, the transaction is
// stored in the session.
//
// An application must supply serialization functions, which determine how the
// client object is serialized into the session.  Typically this will be a
// simple matter of serializing the client's ID, and deserializing by finding
// the client by ID from the database.

server.serializeClient(function (client, callback) {
    debug('server serialize:', client);

    return callback(null, client.id);
});

server.deserializeClient(function (id, callback) {
    debug('server deserialize:', id);

    clientdb.get(id, function (error, client) {
        if (error) { return callback(error); }
        return callback(null, client);
    });
});

// Register supported grant types.
//
// OAuth 2.0 specifies a framework that allows users to grant client
// applications limited access to their protected resources.  It does this
// through a process of the user granting access, and the client exchanging
// the grant for an access token.

// Grant authorization codes.  The callback takes the `client` requesting
// authorization, the `redirectURI` (which is used as a verifier in the
// subsequent exchange), the authenticated `user` granting access, and
// their response, which contains approved scope, duration, etc. as parsed by
// the application.  The application issues a code, which is bound to these
// values, and will be exchanged for an access token.

// we use , (comma) as scope separator
server.grant(oauth2orize.grant.code({ scopeSeparator: ',' }, function (client, redirectURI, user, ares, callback) {
    debug('grant code:', client, redirectURI, user.id, ares);

    var code = uuid.v4();

    // TODO until the oauth clients set the scope, override to '*'
    // var scope = ares.scope.join(',');
    var scope = '*';

    // only give out wildcard scope to the webadmin all other clients are only allowed to request 'profile'
    if (client.id !== 'webadmin') {
        if (ares.scope[0] !== 'profile') return callback(new Error('Requested scope is not allowed for this client'));
        scope = ares.scope.join(',');
    }

    authcodedb.add(code, client.id, redirectURI, user.username, scope, function (error) {
        if (error) return callback(error);
        callback(null, code);
    });
}));

// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.

server.exchange(oauth2orize.exchange.code(function (client, code, redirectURI, callback) {
    debug('exchange:', client, code, redirectURI);

    authcodedb.get(code, function (error, authCode) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) return callback(error);
        if (client.id !== authCode.clientId) return callback(null, false);
        // if (redirectURI !== authCode.redirectURI) return callback(null, false);

        authcodedb.del(code, function (error) {
            if(error) return callback(error);

            var token = tokendb.generateToken();
            var expires = new Date(Date.now() + 60 * 60000).toUTCString(); // 1 hour

            tokendb.add(token, authCode.userId, authCode.clientId, expires, authCode.scope, function (error) {
                if (error) return callback(error);

                debug('new access token for client ' + client.id + ' token ' + token);

                callback(null, token);
            });
        });
    });
}));

// Main login form username and password
function loginForm(req, res) {
    res.render('login');
}

// performs the login POST from the above form
var login = passport.authenticate('local', {
    successReturnToOrRedirect: '/api/v1/session/error',
    failureRedirect: '/api/v1/session/login'
});

// ends the current session
function logout(req, res) {
    req.logout();

    if (req.query && req.query.redirect) res.redirect(req.query.redirect);
    else res.redirect('/');
}

var callback = [
    session.ensureLoggedIn('/api/v1/session/login'),
    function (req, res) {
        debug('callback: with callback server ' + req.query.redirectURI);
        res.render('callback', { callbackServer: req.query.redirectURI });
    }
];

// This would indicate a missing OAuth client session or invalid client ID
var error = [
    session.ensureLoggedIn('/api/v1/session/login'),
    function (req, res) {
        res.render('error', {});
    }
];


// user authorization endpoint
//
// `authorization` middleware accepts a `validate` callback which is
// responsible for validating the client making the authorization request.  In
// doing so, is recommended that the `redirectURI` be checked against a
// registered value, although security requirements may vary accross
// implementations.  Once validated, the `callback` callback must be invoked with
// a `client` instance, as well as the `redirectURI` to which the user will be
// redirected after an authorization decision is obtained.
//
// This middleware simply initializes a new authorization transaction.  It is
// the application's responsibility to authenticate the user and render a dialog
// to obtain their approval (displaying details about the client requesting
// authorization).  We accomplish that here by routing through `ensureLoggedIn()`
// first, and rendering the `dialog` view.

var authorization = [
    session.ensureLoggedIn('/api/v1/session/login'),
    server.authorization(function (clientID, redirectURI, callback) {
        debug('authorization: client %s with callback to %s.', clientID, redirectURI);

        clientdb.getByClientId(clientID, function (error, client) {
            // TODO actually check redirectURI
            if (error) {
                console.error('Unkown client id %s.', clientID);
                return callback(error);
            }

            // we currently pass the redirectURI from the callback through, instead of the one in the db
            callback(null, client, '/api/v1/session/callback?redirectURI=' + redirectURI);
            // callback(null, client, redirectURI);
        });
    }),
// Until we have OAuth scopes, skip decision dialog
// OAuth sopes skip START
    function (req, res, next) {
        req.body.transaction_id = req.oauth2.transactionID;
        next();
    },
    server.decision(function(req, done) {
        debug('decision: with scope', req.oauth2.req.scope);
        return done(null, { scope: req.oauth2.req.scope });
    })
// OAuth sopes skip END
    // function (req, res) {
    //     res.render('dialog', { transactionID: req.oauth2.transactionID, user: req.user, client: req.oauth2.client });
    // }
];

// this triggers the above grant middleware and handles the user's decision if he accepts the access
var decision = [
    session.ensureLoggedIn('/api/v1/session/login'),
    server.decision()
];

// the token endpoint exchanges an authcode for an access token
// it still requires basic or oauth2-client-password authentication
var token = [
    passport.authenticate(['oauth2-client-password'], { session: false }),
    server.token(),
    server.errorHandler()
];

function library(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.render('yellowtent', { adminOrigin: config.adminOrigin });
}

function scope(requestedScope) {
    assert(typeof requestedScope === 'string');

    var requestedScopes = requestedScope.split(',');
    debug('scope: add routes with requested scopes', requestedScopes);

    return [
        passport.authenticate(['bearer'], { session: false }),
        function (req, res, next) {
            if (!req.authInfo || !req.authInfo.scope) return next(new HttpError(401, 'No scope found'));
            if (req.authInfo.scope === '*') return next();

            var scopes = req.authInfo.scope.split(',');
            debug('scope: provided scopes', scopes);

            for (var i = 0; i < requestedScopes.length; ++i) {
                if (scopes.indexOf(requestedScopes[i]) === -1) {
                    debug('scope: missing scope "%s".', requestedScopes[i]);
                    return next(new HttpError(401, 'Missing required scope "' + requestedScopes[i] + '"'));
                }
            }

            next();
        }
    ];
}

function getActiveClients(req, res, next) {
    debug('getActiveClients');

    clientdb.getActiveClientsByUserId(req.user.id, function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        result = result || [];

        debug('getActiveClients: success.', result);

        next(new HttpSuccess(200, { tokens: result }));
    });
}

function delActiveClient(req, res, next) {
    assert(typeof req.params.clientId === 'string');

    debug('delActiveClient: %s.', req.params.clientId);

    tokendb.delByUserIdAndClientId(req.user.id, req.params.clientId, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        debug('delActiveClient: success.');

        next(new HttpSuccess(200, {}));
    });
}

function getTokens(req, res, next) {
    debug('getTokens');

    tokendb.getByUserId(req.user.id, function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        result = result || [];

        debug('getTokens: success.', result);

        next(new HttpSuccess(200, { tokens: result }));
    });
}

function delToken(req, res, next) {
    assert(typeof req.params.token === 'string');

    debug('delToken');

    tokendb.del(req.params.token, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such token'));
        if (error)  return next(new HttpError(500, error));

        debug('delToken: success.');

        next(new HttpSuccess(200, {}));
    });
}

exports = module.exports = {
    loginForm: loginForm,
    login: login,
    logout: logout,
    callback: callback,
    error: error,
    authorization: authorization,
    decision: decision,
    token: token,
    library: library,
    scope: scope,
    getActiveClients: getActiveClients,
    delActiveClient: delActiveClient,
    getTokens: getTokens,
    delToken: delToken
};