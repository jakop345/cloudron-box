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

function sendSignedRequest(url, privateKeyPem, payload, callback) {
    assert.strictEqual(typeof url, 'string');
    assert(util.isBuffer(privateKeyPem));
    assert.strictEqual(typeof payload, 'string');
    assert.strictEqual(typeof callback, 'function');

    var privateKey = ursa.createPrivateKey(privateKeyPem);

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

function registerUser(privateKeyPem, email, callback) {
    assert(util.isBuffer(privateKeyPem));
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof callback, 'function');

    var payload = {
        resource: 'new-reg',
        contact: [ 'mailto:' + email ],
        agreement: LE_AGREEMENT
    };

    debug('registerUser: %s', email);

    sendSignedRequest(CA_STAGING + '/acme/new-reg', privateKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering user: ' + error.message));
        if (result.statusCode === 409) return callback(new AcmeError(AcmeError.ALREADY_EXISTS, result.body.detail));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to register user. Expecting 201, got %s %s', result.statusCode, result.text)));

        debug('registerUser: registered user %s', email);

        callback();
    });
}

function registerDomain(privateKeyPem, domain, callback) {
    assert(util.isBuffer(privateKeyPem));
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

    sendSignedRequest(CA_STAGING + '/acme/new-authz', privateKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering domain: ' + error.message));
        if (result.statusCode === 403) return callback(new AcmeError(AcmeError.FORBIDDEN, result.body.detail));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to register user. Expecting 201, got %s %s', result.statusCode, result.text)));

        debug('registerDomain: registered %s', domain);

        callback(null, result.body);
    });
}

function prepareHttpChallenge(privateKeyPem, challenge, callback) {
    assert(util.isBuffer(privateKeyPem));
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('prepareHttpChallenge: preparing for challenge %j', challenge);

    var token = challenge.token;

    var privateKey = ursa.createPrivateKey(privateKeyPem);

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

function notifyChallengeReady(privateKeyPem, challenge, callback) {
    assert(util.isBuffer(privateKeyPem));
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('notifyChallengeReady: %s was met', challenge.uri);

    var keyAuthorization = fs.readFileSync(path.join(paths.ACME_CHALLENGES_DIR, challenge.token), 'utf8');

    var payload = {
        resource: 'challenge',
        keyAuthorization: keyAuthorization
    };

    sendSignedRequest(challenge.uri, privateKeyPem, JSON.stringify(payload), function (error, result) {
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
function signCertificate(privateKeyPem, certificateDer, callback) {
    assert(util.isBuffer(privateKeyPem));
    assert(util.isBuffer(certificateDer));
    assert.strictEqual(typeof callback, 'function');

    var payload = {
        resource: 'new-cert',
        csr: b64(certificateDer)
    };

    debug('signCertificate: signing %s', payload.csr);

    sendSignedRequest(CA_STAGING + '/acme/new-cert', privateKeyPem, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when signing certificate: ' + error.message));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to sign certificate. Expecting 201, got %s %s', result.statusCode, result.text)));

        // TODO: result.body can be empty in which case it has to be polled for from this location
        debug('signCertificate: certificate is available at ', result.headers['location']);

        callback(null, result.text);
    });
}

function acmeFlow(domain, email, privateKeyPem, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof email, 'string');
    assert(util.isBuffer(privateKeyPem));
    assert.strictEqual(typeof callback, 'function');

    registerUser(privateKeyPem, email, function (error) {
        if (error && error.reason !== AcmeError.ALREADY_EXISTS) return callback(error);

        registerDomain(privateKeyPem, domain, function (error, result) {
            if (error) return callback(error);

            debug('getCertificate: challenges: %j', result);

            var httpChallenges = result.challenges.filter(function(x) { return x.type === 'http-01'; });
            if (httpChallenges.length === 0) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'no http challenges'));
            var challenge = httpChallenges[0];

            prepareHttpChallenge(privateKeyPem, challenge, function (error) {
                if (error) return callback(error);

                notifyChallengeReady(privateKeyPem, challenge, function (error) {
                    if (error) return callback(error);

                    waitForChallenge(challenge, function (error) {
                        if (error) return callback(error);

                        var serverKey = execSync('openssl genrsa 4096');
                        var certificateDer = execSync(util.format('openssl req -nodes -outform DER -subj /CN=%s', domain), { stdio: [ serverKey, null, null ] });

                        signCertificate(privateKeyPem, certificateDer, function (error, certificateDer) {
                            if (error) return callback(error);
                            var certificatePem = execSync('openssl x509 -inform DER -outform PEM', { stdio: [ certificateDer, null, null ] });

                            callback(null, serverKey, certificatePem);
                        });
                    });
                });
            });
        });
    });
}

function getCertificate(domain, callback) {
    var email = 'admin@' + config.fqdn();
    var privateKeyPem;

    if (!fs.existsSync(paths.ACME_ACCOUNT_KEY_FILE)) {
        debug('getCertificate: generating acme account key on first run');
        privateKeyPem = execSync('openssl genrsa 4096');
        fs.writeFileSync(paths.ACME_ACCOUNT_KEY_FILE, privateKeyPem);
    } else {
        privateKeyPem = fs.readFileSync(paths.ACME_ACCOUNT_KEY_FILE);
    }

    acmeFlow(domain, email, privateKeyPem, callback);
}

getCertificate('foobar.girish.in', function (error, key, cert) {
    console.dir(error);
    console.dir(key);
    console.dir(cert);
});
