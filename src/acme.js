/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    config = require('./config.js'),
    crypto = require('crypto'),
    debug = require('debug')('acme'),
    execSync = require('child_process').execSync,
    fs = require('fs'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    superagent = require('superagent'),
    ursa = require('ursa'),
    util = require('util'),
    _ = require('underscore');

var CA_PROD = 'https://acme-v01.api.letsencrypt.org',
    CA_STAGING = 'https://acme-staging.api.letsencrypt.org/',
    LE_AGREEMENT = 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf';

exports = module.exports = {
    getCertificate: getCertificate
};

function AcmeError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(AcmeError, Error);
AcmeError.INTERNAL_ERROR = 'Internal Error';
AcmeError.EXTERNAL_ERROR = 'External Error';
AcmeError.ALREADY_EXISTS = 'Already Exists';
AcmeError.NOT_COMPLETED = 'Not Completed';
AcmeError.FORBIDDEN = 'Forbidden';

// http://jose.readthedocs.org/en/latest/
// https://www.ietf.org/proceedings/92/slides/slides-92-acme-1.pdf
// https://community.letsencrypt.org/t/list-of-client-implementations/2103

function getNonce(callback) {
    superagent.get(CA_STAGING + '/directory', function (error, response) {
        if (error) return callback(error);
        if (response.statusCode !== 200) return callback(new Error('Invalid response code when fetching nonce : ' + response.statusCode));

        return callback(null, response.headers['Replay-Nonce'.toLowerCase()]);
    });
}

// urlsafe base64 encoding (jose)
function urlBase64Encode(string) {
    return string.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64(str) {
    var buf = util.isBuffer(str) ? str : new Buffer(str);
   return urlBase64Encode(buf.toString('base64'));
}

function sendSignedRequest(url, accountKeyPem, payload, callback) {
    assert.strictEqual(typeof url, 'string');
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof payload, 'string');
    assert.strictEqual(typeof callback, 'function');

    var privateKey = ursa.createPrivateKey(accountKeyPem);

    var header = {
        alg: 'RS256',
        jwk: {
            e: b64(privateKey.getExponent()),
            kty: 'RSA',
            n: b64(privateKey.getModulus())
        }
    };
 
    var payload64 = b64(payload);

    getNonce(function (error, nonce) {
        if (error) return callback(error);

        debug('Using nonce %s', nonce);

        var protected64 = b64(JSON.stringify(_.extend({ }, header, { nonce: nonce })));

        var signer = ursa.createSigner('sha256');
        signer.update(protected64 + '.' + payload64, 'utf8');
        var signature64 = urlBase64Encode(signer.sign(privateKey, 'base64'));

        var data = {
            header: header,
            protected: protected64,
            payload: payload64,
            signature: signature64
        };

        superagent.post(url).set('Content-Type', 'application/x-www-form-urlencoded').send(JSON.stringify(data)).buffer().end(function (error, res) {
            if (error && !error.response) return callback(error); // network errors

            callback(null, res);
        });
    });
}

function registerUser(accountKeyPem, email, callback) {
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof callback, 'function');

    var payload = {
        resource: 'new-reg',
        contact: [ 'mailto:' + email ],
        agreement: LE_AGREEMENT
    };

    debug('registerUser: %s', email);

    sendSignedRequest(CA_STAGING + '/acme/new-reg', accountKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering user: ' + error.message));
        if (result.statusCode === 409) return callback(new AcmeError(AcmeError.ALREADY_EXISTS, result.body.detail));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to register user. Expecting 201, got %s %s', result.statusCode, result.text)));

        debug('registerUser: registered user %s', email);

        callback();
    });
}

function registerDomain(accountKeyPem, domain, callback) {
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof callback, 'function');

    var payload = {
        resource: 'new-authz',
        identifier: {
            type: 'dns',
            value: domain
        }
    };

    debug('registerDomain: %s', domain);

    sendSignedRequest(CA_STAGING + '/acme/new-authz', accountKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering domain: ' + error.message));
        if (result.statusCode === 403) return callback(new AcmeError(AcmeError.FORBIDDEN, result.body.detail));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to register user. Expecting 201, got %s %s', result.statusCode, result.text)));

        debug('registerDomain: registered %s', domain);

        callback(null, result.body);
    });
}

function prepareHttpChallenge(accountKeyPem, challenge, callback) {
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('prepareHttpChallenge: preparing for challenge %j', challenge);

    var token = challenge.token;

    var privateKey = ursa.createPrivateKey(accountKeyPem);

    var jwk = {
        e: b64(privateKey.getExponent()),
        kty: 'RSA',
        n: b64(privateKey.getModulus())
    };

    var shasum = crypto.createHash('sha256');
    shasum.update(JSON.stringify(jwk));
    var thumbprint = urlBase64Encode(shasum.digest('base64'));
    var keyAuthorization = token + '.' + thumbprint;

    debug('prepareHttpChallenge: writing %s to %s', keyAuthorization, path.join(paths.ACME_CHALLENGES_DIR, token));

    fs.writeFile(path.join(paths.ACME_CHALLENGES_DIR, token), token + '.' + thumbprint, function (error) {
        if (error) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, error));

        callback();
    });
}

function notifyChallengeReady(accountKeyPem, challenge, callback) {
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('notifyChallengeReady: %s was met', challenge.uri);

    var keyAuthorization = fs.readFileSync(path.join(paths.ACME_CHALLENGES_DIR, challenge.token), 'utf8');

    var payload = {
        resource: 'challenge',
        keyAuthorization: keyAuthorization
    };

    sendSignedRequest(challenge.uri, accountKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when notifying challenge: ' + error.message));
        if (result.statusCode !== 202) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to notify challenge. Expecting 202, got %s %s', result.statusCode, result.text)));

        callback();
    });
}

function waitForChallenge(challenge, callback) {
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('waitingForChallenge: %j', challenge);

    async.retry({ times: 10, interval: 5000 }, function (retryCallback) {
        debug('waitingForChallenge: getting status');

        superagent.get(challenge.uri).end(function (error, result) {
            if (error && !error.response) {
                debug('waitForChallenge: network error getting uri %s', challenge.uri);
                return retryCallback(new AcmeError(AcmeError.EXTERNAL_ERROR, error.message)); // network error
            }
            if (result.statusCode !== 202) {
                debug('waitForChallenge: invalid response code getting uri %s', result.statusCode);
                return retryCallback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Bad response code:' + result.statusCode));
            }

            debug('waitForChallenge: status is "%s"', result.body.status);

            if (result.body.status === 'pending') return retryCallback(new AcmeError(AcmeError.NOT_COMPLETED));
            else if (result.body.status === 'valid') return retryCallback();
            else return retryCallback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Unexpected status: ' + result.body.status));
        });
    }, callback);
}

// https://community.letsencrypt.org/t/public-beta-rate-limits/4772 for rate limits
function signCertificate(accountKeyPem, csrDer, callback) {
    assert(util.isBuffer(accountKeyPem));
    assert(util.isBuffer(csrDer));
    assert.strictEqual(typeof callback, 'function');

    var payload = {
        resource: 'new-cert',
        csr: b64(csrDer)
    };

    debug('signCertificate: signing %s', payload.csr);

    sendSignedRequest(CA_STAGING + '/acme/new-cert', accountKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when signing certificate: ' + error.message));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to sign certificate. Expecting 201, got %s %s', result.statusCode, result.text)));

        // TODO: result.body can be empty in which case it has to be polled for from this location
        debug('signCertificate: certificate is available at (latest) %s and (stable) %s', result.headers['location'], result.headers['content-location']);

        callback(null, result.text);
    });
}

function downloadCertificate(accountKeyPem, domain, outdir, callback) {
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof outdir, 'string');
    assert.strictEqual(typeof callback, 'function');

    var execSync = safe.child_process.execSync;

    var privateKeyFile = path.join(outdir, domain + '.key');
    var key = execSync('openssl genrsa 4096');
    if (!key) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));
    if (!safe.fs.writeFileSync(privateKeyFile, key)) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

    debug('downloadCertificate: key file saved at %s', privateKeyFile);

    var csrDer = execSync(util.format('openssl req -new -key %s -outform DER -subj /CN=%s', privateKeyFile, domain));
    if (!csrDer) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

    signCertificate(accountKeyPem, csrDer, function (error, certificateDer) {
        if (error) return callback(error);

        safe.fs.writeFileSync(path.join(outdir, domain + '.der'), certificateDer);
        debug('downloadCertificate: cert der file saved ');

        var certificatePem = execSync('openssl x509 -inform DER -outform PEM', { input: certificateDer }); // this is really just base64 encoding with header
        if (!certificatePem) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        var certificateFile = path.join(outdir, domain + '.cert');
        if (!safe.fs.writeFileSync(certificateFile, certificatePem)) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        callback();
    });
}

function acmeFlow(domain, email, accountKeyPem, outdir, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof email, 'string');
    assert(util.isBuffer(accountKeyPem));
    assert.strictEqual(typeof outdir, 'string');
    assert.strictEqual(typeof callback, 'function');

    registerUser(accountKeyPem, email, function (error) {
        if (error && error.reason !== AcmeError.ALREADY_EXISTS) return callback(error);

        registerDomain(accountKeyPem, domain, function (error, result) {
            if (error) return callback(error);

            debug('acmeFlow: challenges: %j', result);

            var httpChallenges = result.challenges.filter(function(x) { return x.type === 'http-01'; });
            if (httpChallenges.length === 0) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'no http challenges'));
            var challenge = httpChallenges[0];

            async.series([
                prepareHttpChallenge.bind(null, accountKeyPem, challenge),
                notifyChallengeReady.bind(null, accountKeyPem, challenge),
                waitForChallenge.bind(null, challenge),
                downloadCertificate.bind(null, accountKeyPem, domain, outdir)
            ], callback);
        });
    });
}

function getCertificate(domain, outdir, callback) {
    var email = 'admin@' + config.fqdn();
    var accountKeyPem;

    if (!fs.existsSync(paths.ACME_ACCOUNT_KEY_FILE)) {
        debug('getCertificate: generating acme account key on first run');
        accountKeyPem = safe.execSync('openssl genrsa 4096');
        if (!accountKeyPem) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        safe.fs.writeFileSync(paths.ACME_ACCOUNT_KEY_FILE, accountKeyPem);
    } else {
        accountKeyPem = fs.readFileSync(paths.ACME_ACCOUNT_KEY_FILE);
    }

    acmeFlow(domain, email, accountKeyPem, outdir, callback);
}

getCertificate('my.girish.in', process.cwd(), function (error) {
    console.dir(error);
});
