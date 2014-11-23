/* jslint  node:true */

'use strict';

var assert = require('assert'),
    authcodedb = require('../authcodedb'),
    clientdb = require('../clientdb'),
    config = require('../../config.js'),
    DatabaseError = require('../databaseerror'),
    debug = require('debug')('box:routes/oauth2'),
    http = require('http'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    mailer = require('../mailer.js'),
    middleware = require('../../middleware/index.js'),
    oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    session = require('connect-ensure-login'),
    tokendb = require('../tokendb'),
    url = require('url'),
    user = require('../user.js'),
    userdb = require('../userdb'),
    uuid = require('node-uuid');

// create OAuth 2.0 server
var gServer = oauth2orize.createServer();

// Proxy cache stored by port
var gProxyMiddlewareCache =  { };

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

    var code = uuid.v4();
    var scopes = client.scope ? client.scope.split(',') : ['profile','roleUser'];

    if (scopes.indexOf('roleAdmin') !== -1 && !user.admin) {
        debug('grant code: not allowed, you need to be admin');
        return callback(new Error('Admin capabilities required'));
    }

    authcodedb.add(code, client.id, user.username, function (error) {
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
            var expires = new Date(Date.now() + 60 * 60000).toUTCString(); // 1 hour

            tokendb.add(token, authCode.userId, authCode.clientId, expires, client.scope, function (error) {
                if (error) return callback(error);

                debug('new access token for client ' + client.id + ' token ' + token);

                callback(null, token);
            });
        });
    });
}));

// Main login form username and password
function loginForm(req, res) {
    res.render('login', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken() });
}

// In memory password reset token store
var resetTokens = {};

// Form to enter email address to send a password reset request mail
function passwordResetRequestSite(req, res) {
    res.render('password_reset_request', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken() });
}

// This route is used for above form submission
function passwordResetRequest(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'Missing email'));

    debug('passwordResetRequest: email %s.', req.body.email);

    userdb.getByEmail(req.body.email, function (error, result) {
        if (!error) {
            resetTokens[result.id] = uuid.v4();
            debug('passwordResetRequest: found user %s send reset token %s', result.username, resetTokens[result.id]);
            mailer.passwordReset(result, resetTokens[result.id]);
        }

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

    function finish(key) {
        userdb.get(key, function (error, result) {
            if (error) return next(new HttpError(400, 'Unknown reset token'));

            res.render('password_reset', { adminOrigin: config.adminOrigin(), user: result, csrf: req.csrfToken(), resetToken: req.query.reset_token });
        });
    }

    for (var key in resetTokens) {
        if (resetTokens[key] === req.query.reset_token) return finish(key);
    }

    next(new HttpError(400, 'Unkown reset_token'));
}

function passwordReset(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.resetToken !== 'string') return next(new HttpError(400, 'Missing resetToken'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'Missing password'));
    if (typeof req.body.passwordRepeat !== 'string') return next(new HttpError(400, 'Missing passwordRepeat'));

    debug('passwordReset: with token %s.', req.body.resetToken);

    if (req.body.password !== req.body.passwordRepeat) return next(new HttpError(400, 'Passwords don\'t match'));

    function finish(userId) {
        user.resetPassword(userId, req.body.password, function (error) {
            if (error) return next(new HttpError(400, 'Unknown reset token'));

            res.redirect(config.adminOrigin());
        });
    }

    for (var userId in resetTokens) {
        if (resetTokens[userId] === req.body.resetToken) return finish(userId);
    }

    next(new HttpError(400, 'Unkown resetToken'));
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
        res.render('error', { adminOrigin: config.adminOrigin() });
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

        clientdb.getByClientId(clientID, function (error, client) {
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
    res.render('yellowtent', { adminOrigin: config.adminOrigin() });
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

    tokendb.getByUserIdAndClientId(req.user.id, req.params.clientId, function (error, result) {
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

    tokendb.delByUserIdAndClientId(req.user.id, req.params.clientId, function (error) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));

        debug('delClientTokens: success.');

        next(new HttpSuccess(204));
    });
}

var applicationProxy = [
    function (req, res, next) {
        if (req.path === '/api/v1/oauth/proxy/api/v1/session/login') {
            if (req.method === 'GET') {

                // in case we login, the returnTo needs to be rewritten, to get rid of the proxy prefix
                var proxyPrefix = '/api/v1/oauth/proxy';
                req.session.returnTo = req.session.returnTo.indexOf(proxyPrefix) === 0 ? req.session.returnTo.slice(proxyPrefix.length) : req.session.returnTo;

                return loginForm(req, res);
            } else if (req.method === 'POST') {
                // TODO check for roleUser/roleAdmin
                return passport.authenticate('local', {
                    successReturnToOrRedirect: '/api/v1/session/error',
                    failureRedirect: '/api/v1/session/login'
                })(req, res, next);
            }
        }
        next();
    },
    session.ensureLoggedIn('/api/v1/session/login'),
    function proxyToApplication(req, res, next) {
        var port = parseInt(req.headers['x-cloudron-proxy-port'], 10);
        if (!Number.isFinite(port)) return next(new HttpError(500, 'Routing error'));

        var proxyMiddleware = gProxyMiddlewareCache[port];
        if (!proxyMiddleware) {
            debug('Adding proxy middleware for port %d', port);
            proxyMiddleware = middleware.proxy(url.parse('http://127.0.0.1:' + port));
            gProxyMiddlewareCache[port] = proxyMiddleware;
        }

        // if you fix the code below, code in routes/graphs.js:forwardToGraphite probably needs fixing
        // TODO: is it safe to pass the cookie?
        var parsedUrl = url.parse(req.url, true /* parseQueryString */);
        delete parsedUrl.query['access_token'];
        delete req.headers['authorization']

        debug('proxying %s to port %d', req.params[0], port);

        req.url = url.format({ pathname: req.params[0] /* parsedUrl.pathname */, query: parsedUrl.query });

        proxyMiddleware(req, res, next);
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
    passwordReset: passwordReset,
    authorization: authorization,
    decision: decision,
    token: token,
    library: library,
    scope: scope,
    getClients: getClients,
    getClientTokens: getClientTokens,
    delClientTokens: delClientTokens,
    applicationProxy: applicationProxy
};
