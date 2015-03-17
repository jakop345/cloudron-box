/* jslint  node:true */

'use strict';

var assert = require('assert'),
    authcodedb = require('../authcodedb'),
    clientdb = require('../clientdb'),
    config = require('../../config.js'),
    constants = require('../../constants.js'),
    DatabaseError = require('../databaseerror'),
    debug = require('debug')('box:routes/oauth2'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    middleware = require('../middleware/index.js'),
    oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    session = require('connect-ensure-login'),
    tokendb = require('../tokendb'),
    appdb = require('../appdb'),
    url = require('url'),
    user = require('../user.js'),
    hat = require('hat');

// create OAuth 2.0 server
var gServer = oauth2orize.createServer();

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

gServer.serializeClient(function (client, callback) {
    debug('server serialize:', client);

    return callback(null, client.id);
});

gServer.deserializeClient(function (id, callback) {
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
gServer.grant(oauth2orize.grant.code({ scopeSeparator: ',' }, function (client, redirectURI, user, ares, callback) {
    debug('grant code:', client, redirectURI, user.id, ares);

    var code = hat();
    var expiresAt = Date.now() + 60 * 60000; // 1 hour
    var scopes = client.scope ? client.scope.split(',') : ['profile','roleUser'];

    if (scopes.indexOf('roleAdmin') !== -1 && !user.admin) {
        debug('grant code: not allowed, you need to be admin');
        return callback(new Error('Admin capabilities required'));
    }

    authcodedb.add(code, client.id, user.username, expiresAt, function (error) {
        if (error) return callback(error);
        callback(null, code);
    });
}));

// Exchange authorization codes for access tokens.  The callback accepts the
// `client`, which is exchanging `code` and any `redirectURI` from the
// authorization request for verification.  If these values are validated, the
// application issues an access token on behalf of the user who authorized the
// code.

gServer.exchange(oauth2orize.exchange.code(function (client, code, redirectURI, callback) {
    debug('exchange:', client, code, redirectURI);

    authcodedb.get(code, function (error, authCode) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
        if (error) return callback(error);
        if (client.id !== authCode.clientId) return callback(null, false);

        authcodedb.del(code, function (error) {
            if(error) return callback(error);

            var token = tokendb.generateToken();
            var expires = Date.now() + 60 * 60000; // 1 hour

            tokendb.add(token, 'user-' + authCode.userId, authCode.clientId, expires, client.scope, function (error) {
                if (error) return callback(error);

                debug('new access token for client ' + client.id + ' token ' + token);

                callback(null, token);
            });
        });
    });
}));

// Main login form username and password
function loginForm(req, res) {
    if (!req.session.returnTo) {
        return res.render('error', {
            user: req.user,
            adminOrigin: config.adminOrigin(),
            message: 'Invalid login request'
        });
    }

    var u = url.parse(req.session.returnTo, true);

    if (!u.query.client_id) {
        return res.render('error', {
            user: req.user,
            adminOrigin: config.adminOrigin(),
            message: 'Invalid login request'
        });
    }

    clientdb.get(u.query.client_id, function (error, result) {
        if (error) {
            return res.render('error', {
                user: req.user,
                adminOrigin: config.adminOrigin(),
                message: 'Unknown OAuth client'
            });
        }

        if (result.appId === constants.ADMIN_CLIENT_ID) {
            return res.render('login', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken(), applicationName: constants.ADMIN_NAME });
        }

        var appId = result.appId;
        // Handle our different types of oauth clients
        if (result.appId.indexOf('addon-') === 0) {
            appId = result.appId.slice('addon-'.length);
        } else if (result.appId.indexOf('proxy-') === 0) {
            appId = result.appId.slice('proxy-'.length);
        }

        appdb.get(appId, function (error, result) {
            if (error) {
                return res.render('error', {
                    user: req.user,
                    adminOrigin: config.adminOrigin(),
                    message: 'Unknown Application for those OAuth credentials'
                });
            }

            res.render('login', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken(), applicationName: result.location });
        });
    });
}

// Form to enter email address to send a password reset request mail
function passwordResetRequestSite(req, res) {
    res.render('password_reset_request', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken() });
}

// This route is used for above form submission
function passwordResetRequest(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.identifier !== 'string') return next(new HttpError(400, 'Missing identifier'));

    debug('passwordResetRequest: email or username %s.', req.body.identifier);

    user.resetPasswordByIdentifier(req.body.identifier, function (error) {
        if (error) console.error(error); // TODO redirect to an error page

        res.redirect('/api/v1/session/password/sent.html');
    });
}

function passwordSentSite(req, res) {
    debug('passwordSentSite');

    res.render('password_reset_sent', { adminOrigin: config.adminOrigin() });
}

function passwordResetSite(req, res, next) {
    if (!req.query.reset_token) return next(new HttpError(400, 'Missing reset_token'));

    debug('passwordResetSite: with token %s.', req.query.reset_token);

    user.getByResetToken(req.query.reset_token, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid reset_token'));

        res.render('password_reset', { adminOrigin: config.adminOrigin(), user: user, csrf: req.csrfToken(), resetToken: req.query.reset_token });
    });
}

function passwordSetupSite(req, res, next) {
    if (!req.query.reset_token) return next(new HttpError(400, 'Missing reset_token'));

    debug('passwordSetupSite: with token %s.', req.query.reset_token);

    user.getByResetToken(req.query.reset_token, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid reset_token'));

        res.render('password_setup', { adminOrigin: config.adminOrigin(), user: user, csrf: req.csrfToken(), resetToken: req.query.reset_token });
    });
}

function passwordReset(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.resetToken !== 'string') return next(new HttpError(400, 'Missing resetToken'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'Missing password'));

    debug('passwordReset: with token %s.', req.body.resetToken);

    user.getByResetToken(req.body.resetToken, function (error, result) {
        if (error) return next(new HttpError(401, 'Invalid resetToken'));

        // setPassword clears the resetToken
        user.setPassword(result.id, req.body.password, function (error) {
            if (error) return next(new HttpError(500, error));

            res.redirect(config.adminOrigin());
        });
    });
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


/*

  The callback page takes the redirectURI and the authCode and redirects the browser accordingly

*/
var callback = [
    session.ensureLoggedIn('/api/v1/session/login'),
    function (req, res) {
        debug('callback: with callback server ' + req.query.redirectURI);
        res.render('callback', { adminOrigin: config.adminOrigin(), callbackServer: req.query.redirectURI });
    }
];


/*

  This indicates a missing OAuth client session or invalid client ID

*/
var error = [
    session.ensureLoggedIn('/api/v1/session/login'),
    function (req, res) {
        res.render('error', {
            user: req.user,
            adminOrigin: config.adminOrigin(),
            message: 'Invalid OAuth Client'
        });
    }
];


/*

  The authorization endpoint is the entry point for an OAuth login.

  Each app would start OAuth by redirecting the user to:

    /api/v1/oauth/dialog/authorize?response_type=code&client_id=<clientId>&redirect_uri=<callbackURL>&scope=<ignored>

  - First, this will ensure the user is logged in.
  - Then in normal OAuth it would ask the user for permissions to the scopes, which we will do on app installation
  - Then it will redirect the browser to the given <callbackURL> containing the authcode in the query

  Scopes are set by the app during installation, the ones given on OAuth transaction start are simply ignored.

*/
var authorization = [
    session.ensureLoggedIn('/api/v1/session/login'),
    gServer.authorization(function (clientID, redirectURI, callback) {
        debug('authorization: client %s with callback to %s.', clientID, redirectURI);

        clientdb.get(clientID, function (error, client) {
            if (error) {
                console.error('Unkown client id %s.', clientID);
                return callback(error);
            }

            // ignore the origin passed into form the client, but use the one from the clientdb
            var redirectPath = url.parse(redirectURI).path;
            var redirectOrigin = client.redirectURI;

            callback(null, client, '/api/v1/session/callback?redirectURI=' + url.resolve(redirectOrigin, redirectPath));
        });
    }),
    // Until we have OAuth scopes, skip decision dialog
    // OAuth sopes skip START
    function (req, res, next) {
        assert(typeof req.body === 'object');
        assert(typeof req.oauth2 === 'object');

        var scopes = req.oauth2.client.scope ? req.oauth2.client.scope.split(',') : ['profile','roleUser'];

        if (scopes.indexOf('roleAdmin') !== -1 && !req.user.admin) {
            debug('authorization: not allowed, user needs to be admin');
            return res.render('error', {
                user: req.user,
                adminOrigin: config.adminOrigin(),
                message: 'Admin capabilities required. <a href="' + req.oauth2.client.redirectURI + '">Retry</a>'
            });
        }

        req.body.transaction_id = req.oauth2.transactionID;
        next();
    },
    gServer.decision(function(req, done) {
        debug('decision: with scope', req.oauth2.req.scope);
        return done(null, { scope: req.oauth2.req.scope });
    })
    // OAuth sopes skip END
    // function (req, res) {
    //     res.render('dialog', { transactionID: req.oauth2.transactionID, user: req.user, client: req.oauth2.client, csrf: req.csrfToken() });
    // }
];

// this triggers the above grant middleware and handles the user's decision if he accepts the access
var decision = [
    session.ensureLoggedIn('/api/v1/session/login'),
    gServer.decision()
];


/*

  The token endpoint allows an OAuth client to exchange an authcode with an accesstoken.

  Authcodes are obtained using the authorization endpoint. The route is authenticated by
  providing a Basic auth with clientID as username and clientSecret as password.
  An authcode is only good for one such exchange to an accesstoken.

*/
var token = [
    passport.authenticate(['oauth2-client-password'], { session: false }),
    gServer.token(),
    gServer.errorHandler()
];


/*

  Route so serve up the OAuth client side helper library

*/
function library(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.render('cloudron', { adminOrigin: config.adminOrigin() });
}


/*

  The scope middleware provides an auth middleware for routes.

  It is used for API routes, which are authenticated using accesstokens.
  Those accesstokens carry OAuth scopes and the middleware takes the required
  scope as an argument and will verify the accesstoken against it.

  See server.js:
    var profileScope = routes.oauth2.scope('profile');

*/
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

function getClients(req, res, next) {
    debug('getClients');

    clientdb.getAllWithDetails(function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        result = result || [];

        debug('getClients: success.', result);

        next(new HttpSuccess(200, { clients: result }));
    });
}

function getClientTokens(req, res, next) {
    assert(typeof req.params.clientId === 'string');
    assert(typeof req.user === 'object');

    debug('getClientTokens');

    tokendb.getByIdentifierAndClientId('user-', req.user.id, req.params.clientId, function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        result = result || [];

        debug('getClientTokens: success.', result);

        next(new HttpSuccess(200, { tokens: result }));
    });
}

function delClientTokens(req, res, next) {
    assert(typeof req.params.clientId === 'string');
    assert(typeof req.user === 'object');

    debug('delClientTokens: user %s and client %s.', req.user.id, req.params.clientId);

    tokendb.delByIdentifierAndClientId('user-' + req.user.id, req.params.clientId, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        debug('delClientTokens: success.');

        next(new HttpSuccess(204));
    });
}

// Cross-site request forgery protection middleware for login form
var csrf = [
    middleware.csrf(),
    function (err, req, res, next) {
        if (err.code !== 'EBADCSRFTOKEN') return next(err);

        res.render('error', {
            user: req.user,
            adminOrigin: config.adminOrigin(),
            message: 'Form expired'
        });
    }
];

exports = module.exports = {
    loginForm: loginForm,
    login: login,
    logout: logout,
    callback: callback,
    error: error,
    passwordResetRequestSite: passwordResetRequestSite,
    passwordResetRequest: passwordResetRequest,
    passwordSentSite: passwordSentSite,
    passwordResetSite: passwordResetSite,
    passwordSetupSite: passwordSetupSite,
    passwordReset: passwordReset,
    authorization: authorization,
    decision: decision,
    token: token,
    library: library,
    scope: scope,
    getClients: getClients,
    getClientTokens: getClientTokens,
    delClientTokens: delClientTokens,
    csrf: csrf
};
