/* jslint  node:true */

'use strict';

var assert = require('assert'),
    authcodedb = require('../authcodedb'),
    clientdb = require('../clientdb'),
    config = require('../config.js'),
    constants = require('../constants.js'),
    DatabaseError = require('../databaseerror'),
    debug = require('debug')('box:routes/oauth2'),
    HttpError = require('connect-lastmile').HttpError,
    middleware = require('../middleware/index.js'),
    oauth2orize = require('oauth2orize'),
    passport = require('passport'),
    querystring = require('querystring'),
    util = require('util'),
    session = require('connect-ensure-login'),
    settings = require('../settings.js'),
    tokendb = require('../tokendb'),
    appdb = require('../appdb'),
    url = require('url'),
    user = require('../user.js'),
    UserError = user.UserError,
    hat = require('hat');

// create OAuth 2.0 server
var gServer = oauth2orize.createServer();


// Register supported grant types.

// Grant authorization codes.  The callback takes the `client` requesting
// authorization, the `redirectURI` (which is used as a verifier in the
// subsequent exchange), the authenticated `user` granting access, and
// their response, which contains approved scope, duration, etc. as parsed by
// the application.  The application issues a code, which is bound to these
// values, and will be exchanged for an access token.

gServer.grant(oauth2orize.grant.code({ scopeSeparator: ',' }, function (client, redirectURI, user, ares, callback) {
    debug('grant code:', client, redirectURI, user.id, ares);

    var code = hat(256);
    var expiresAt = Date.now() + 60 * 60000; // 1 hour

    // TODO check groups/users here

    authcodedb.add(code, client.id, user.username, expiresAt, function (error) {
        if (error) return callback(error);
        callback(null, code);
    });
}));


gServer.grant(oauth2orize.grant.token({ scopeSeparator: ',' }, function (client, user, ares, callback) {
    debug('grant token:', client.id, user.id, ares);

    var token = tokendb.generateToken();
    var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

    tokendb.add(token, tokendb.PREFIX_USER + user.id, client.id, expires, client.scope, function (error) {
        if (error) return callback(error);

        debug('new access token for client ' + client.id + ' token ' + token);

        callback(null, token);
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
            var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

            tokendb.add(token, tokendb.PREFIX_USER + authCode.userId, authCode.clientId, expires, client.scope, function (error) {
                if (error) return callback(error);

                debug('new access token for client ' + client.id + ' token ' + token);

                callback(null, token);
            });
        });
    });
}));

// overwrite the session.ensureLoggedIn to not use res.redirect() due to a chrome bug not sending cookies on redirects
session.ensureLoggedIn = function (redirectTo) {
    assert.strictEqual(typeof redirectTo, 'string');

    return function (req, res, next) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            if (req.session) {
                req.session.returnTo = req.originalUrl || req.url;
            }

            res.status(200).send(util.format('<script>window.location.href = "%s";</script>', redirectTo));
        } else {
            next();
        }
    };
};

function renderTemplate(res, template, data) {
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof template, 'string');
    assert.strictEqual(typeof data, 'object');

    settings.getCloudronName(function (error, cloudronName) {
        if (error) console.error(error);

        // amend details which the header expects
        data.cloudronName = cloudronName || 'Cloudron';

        res.render(template, data);
    });
}

function sendErrorPageOrRedirect(req, res, message) {
    assert.strictEqual(typeof req, 'object');
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof message, 'string');

    debug('sendErrorPageOrRedirect: returnTo "%s".', req.query.returnTo, message);

    if (typeof req.query.returnTo !== 'string') {
        renderTemplate(res, 'error', {
            adminOrigin: config.adminOrigin(),
            message: message
        });
    } else {
        var u = url.parse(req.query.returnTo);
        if (!u.protocol || !u.host) {
            return renderTemplate(res, 'error', {
                adminOrigin: config.adminOrigin(),
                message: 'Invalid request. returnTo query is not a valid URI. ' + message
            });
        }

        res.redirect(util.format('%s//%s', u.protocol, u.host));
    }
}

// use this instead of sendErrorPageOrRedirect(), in case we have a returnTo provided in the query, to avoid login loops
// This usually happens when the OAuth client ID is wrong
function sendError(req, res, message) {
    assert.strictEqual(typeof req, 'object');
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof message, 'string');

    renderTemplate(res, 'error', {
        adminOrigin: config.adminOrigin(),
        message: message
    });
}

// Main login form username and password
function loginForm(req, res) {
    if (typeof req.session.returnTo !== 'string') return sendErrorPageOrRedirect(req, res, 'Invalid login request. No returnTo provided.');

    var u = url.parse(req.session.returnTo, true);
    if (!u.query.client_id) return sendErrorPageOrRedirect(req, res, 'Invalid login request. No client_id provided.');

    function render(applicationName, applicationLogo) {
        renderTemplate(res, 'login', {
            adminOrigin: config.adminOrigin(),
            csrf: req.csrfToken(),
            applicationName: applicationName,
            applicationLogo: applicationLogo,
            error: req.query.error || null
        });
    }

    clientdb.get(u.query.client_id, function (error, result) {
        if (error) return sendError(req, res, 'Unknown OAuth client');

        // Handle our different types of oauth clients
        var appId = result.appId;
        if (appId === constants.ADMIN_CLIENT_ID) {
            return render(constants.ADMIN_NAME, '/api/v1/cloudron/avatar');
        } else if (appId === constants.TEST_CLIENT_ID) {
            return render(constants.TEST_NAME, '/api/v1/cloudron/avatar');
        } else if (appId.indexOf('external-') === 0) {
            return render('External Application', '/api/v1/cloudron/avatar');
        } else if (appId.indexOf('addon-oauth-') === 0) {
            appId = appId.slice('addon-oauth-'.length);
        } else if (appId.indexOf('proxy-') === 0) {
            appId = appId.slice('proxy-'.length);
        }

        appdb.get(appId, function (error, result) {
            if (error) return sendErrorPageOrRedirect(req, res, 'Unknown Application for those OAuth credentials');

            var applicationName = result.location || config.fqdn();
            render(applicationName, '/api/v1/apps/' + result.id + '/icon');
        });
    });
}

// performs the login POST from the login form
function login(req, res) {
    var returnTo = req.session.returnTo || req.query.returnTo;

    debug('handle login: returnTo %s', returnTo, req.body, req.query);

    var failureQuery = querystring.stringify({ error: 'Invalid username or password', returnTo: returnTo });
    passport.authenticate('local', {
        failureRedirect: '/api/v1/session/login?' + failureQuery
    })(req, res, function () {
        res.redirect(returnTo);
    });
}

// ends the current session
function logout(req, res) {
    req.logout();

    if (req.query && req.query.redirect) res.redirect(req.query.redirect);
    else res.redirect('/');
}

// Form to enter email address to send a password reset request mail
// -> GET /api/v1/session/password/resetRequest.html
function passwordResetRequestSite(req, res) {
    renderTemplate(res, 'password_reset_request', { adminOrigin: config.adminOrigin(), csrf: req.csrfToken() });
}

// This route is used for above form submission
// -> POST /api/v1/session/password/resetRequest
function passwordResetRequest(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.identifier !== 'string') return next(new HttpError(400, 'Missing identifier'));

    debug('passwordResetRequest: email or username %s.', req.body.identifier);

    user.resetPasswordByIdentifier(req.body.identifier, function (error) {
        if (error && error.reason !== UserError.NOT_FOUND) {
            console.error(error);
            return sendErrorPageOrRedirect(req, res, 'User not found');
        }

        res.redirect('/api/v1/session/password/sent.html');
    });
}

// -> GET /api/v1/session/password/sent.html
function passwordSentSite(req, res) {
    renderTemplate(res, 'password_reset_sent', { adminOrigin: config.adminOrigin() });
}

// -> GET /api/v1/session/password/setup.html
function passwordSetupSite(req, res, next) {
    if (!req.query.reset_token) return next(new HttpError(400, 'Missing reset_token'));

    debug('passwordSetupSite: with token %s.', req.query.reset_token);

    user.getByResetToken(req.query.reset_token, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid reset_token'));

        renderTemplate(res, 'password_setup', {
            adminOrigin: config.adminOrigin(),
            user: user,
            csrf: req.csrfToken(),
            resetToken: req.query.reset_token
        });
    });
}

// -> GET /api/v1/session/password/reset.html
function passwordResetSite(req, res, next) {
    if (!req.query.reset_token) return next(new HttpError(400, 'Missing reset_token'));

    debug('passwordResetSite: with token %s.', req.query.reset_token);

    user.getByResetToken(req.query.reset_token, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid reset_token'));

        renderTemplate(res, 'password_reset', {
            adminOrigin: config.adminOrigin(),
            user: user,
            csrf: req.csrfToken(),
            resetToken: req.query.reset_token
        });
    });
}

// -> POST /api/v1/session/password/reset
function passwordReset(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.resetToken !== 'string') return next(new HttpError(400, 'Missing resetToken'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'Missing password'));

    debug('passwordReset: with token %s.', req.body.resetToken);

    user.getByResetToken(req.body.resetToken, function (error, userObject) {
        if (error) return next(new HttpError(401, 'Invalid resetToken'));

        // setPassword clears the resetToken
        user.setPassword(userObject.id, req.body.password, function (error, result) {
            if (error) return next(new HttpError(500, error));

            res.redirect(util.format('%s?accessToken=%s&expiresAt=%s', config.adminOrigin(), result.token, result.expiresAt));
        });
    });
}


/*

  The callback page takes the redirectURI and the authCode and redirects the browser accordingly

*/
var callback = [
    session.ensureLoggedIn('/api/v1/session/login'),
    function (req, res) {
        debug('callback: with callback server ' + req.query.redirectURI);
        renderTemplate(res, 'callback', { adminOrigin: config.adminOrigin(), callbackServer: req.query.redirectURI });
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
    // extract the returnTo origin and set as query param
    function (req, res, next) {
        if (!req.query.redirect_uri) return sendErrorPageOrRedirect(req, res, 'Invalid request. redirect_uri query param is not set.');
        if (!req.query.client_id) return sendErrorPageOrRedirect(req, res, 'Invalid request. client_id query param is not set.');
        if (!req.query.response_type) return sendErrorPageOrRedirect(req, res, 'Invalid request. response_type query param is not set.');
        if (req.query.response_type !== 'code' && req.query.response_type !== 'token') return sendErrorPageOrRedirect(req, res, 'Invalid request. Only token and code response types are supported.');

        session.ensureLoggedIn('/api/v1/session/login?returnTo=' + req.query.redirect_uri)(req, res, next);
    },
    gServer.authorization({}, function (clientId, redirectURI, callback) {
        debug('authorization: client %s with callback to %s.', clientId, redirectURI);

        clientdb.get(clientId, function (error, client) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, false);
            if (error) return callback(error);

            // ignore the origin passed into form the client, but use the one from the clientdb
            var redirectPath = url.parse(redirectURI).path;
            var redirectOrigin = client.redirectURI;

            callback(null, client, '/api/v1/session/callback?redirectURI=' + url.resolve(redirectOrigin, redirectPath));
        });
    }, function (client, user, done) {
        // This allows us to skip decision dialog
        return done (null, true);
    })
];


/*

  The token endpoint allows an OAuth client to exchange an authcode with an accesstoken.

  Authcodes are obtained using the authorization endpoint. The route is authenticated by
  providing a Basic auth with clientID as username and clientSecret as password.
  An authcode is only good for one such exchange to an accesstoken.

*/
var token = [
    passport.authenticate(['basic', 'oauth2-client-password'], { session: false }),
    gServer.token(),
    gServer.errorHandler()
];


/*

  The scope middleware provides an auth middleware for routes.

  It is used for API routes, which are authenticated using accesstokens.
  Those accesstokens carry OAuth scopes and the middleware takes the required
  scope as an argument and will verify the accesstoken against it.

  See server.js:
    var profileScope = routes.oauth2.scope('profile');

*/
function scope(requestedScope) {
    assert.strictEqual(typeof requestedScope, 'string');

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

// Cross-site request forgery protection middleware for login form
var csrf = [
    middleware.csrf(),
    function (err, req, res, next) {
        if (err.code !== 'EBADCSRFTOKEN') return next(err);

        sendErrorPageOrRedirect(req, res, 'Form expired');
    }
];

exports = module.exports = {
    loginForm: loginForm,
    login: login,
    logout: logout,
    callback: callback,
    passwordResetRequestSite: passwordResetRequestSite,
    passwordResetRequest: passwordResetRequest,
    passwordSentSite: passwordSentSite,
    passwordResetSite: passwordResetSite,
    passwordSetupSite: passwordSetupSite,
    passwordReset: passwordReset,
    authorization: authorization,
    token: token,
    scope: scope,
    csrf: csrf
};
