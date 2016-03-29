'use strict';

var assert = require('assert'),
    async = require('async'),
    crypto = require('crypto'),
    debug = require('debug')('box:cert/acme'),
    fs = require('fs'),
    parseLinks = require('parse-links'),
    path = require('path'),
    paths = require('../paths.js'),
    safe = require('safetydance'),
    superagent = require('superagent'),
    ursa = require('ursa'),
    util = require('util'),
    _ = require('underscore');

var CA_PROD = 'https://acme-v01.api.letsencrypt.org',
    CA_STAGING = 'https://acme-staging.api.letsencrypt.org',
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

function Acme(options) {
    assert.strictEqual(typeof options, 'object');

    this.caOrigin = options.prod ? CA_PROD : CA_STAGING;
    this.accountKeyPem = null; // Buffer
    this.email = options.email;
}

Acme.prototype.getNonce = function (callback) {
    superagent.get(this.caOrigin + '/directory', function (error, response) {
        if (error) return callback(error);
        if (response.statusCode !== 200) return callback(new Error('Invalid response code when fetching nonce : ' + response.statusCode));

        return callback(null, response.headers['Replay-Nonce'.toLowerCase()]);
    });
};

// urlsafe base64 encoding (jose)
function urlBase64Encode(string) {
    return string.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64(str) {
    var buf = util.isBuffer(str) ? str : new Buffer(str);
   return urlBase64Encode(buf.toString('base64'));
}

Acme.prototype.sendSignedRequest = function (url, payload, callback) {
    assert.strictEqual(typeof url, 'string');
    assert.strictEqual(typeof payload, 'string');
    assert.strictEqual(typeof callback, 'function');

    assert(util.isBuffer(this.accountKeyPem));
    var privateKey = ursa.createPrivateKey(this.accountKeyPem);

    var header = {
        alg: 'RS256',
        jwk: {
            e: b64(privateKey.getExponent()),
            kty: 'RSA',
            n: b64(privateKey.getModulus())
        }
    };
 
    var payload64 = b64(payload);

    this.getNonce(function (error, nonce) {
        if (error) return callback(error);

        debug('sendSignedRequest: using nonce %s for url %s', nonce, url);

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

        superagent.post(url).set('Content-Type', 'application/x-www-form-urlencoded').send(JSON.stringify(data)).end(function (error, res) {
            if (error && !error.response) return callback(error); // network errors

            callback(null, res);
        });
    });
};

Acme.prototype.updateContact = function (registrationUri, callback) {
    assert.strictEqual(typeof registrationUri, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('updateContact: %s %s', registrationUri, this.email);

    // https://github.com/ietf-wg-acme/acme/issues/30
    var payload = {
        resource: 'reg',
        contact: [ 'mailto:' + this.email ],
        agreement: LE_AGREEMENT
    };

    var that = this;
    this.sendSignedRequest(registrationUri, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering user: ' + error.message));
        if (result.statusCode !== 202) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to update contact. Expecting 202, got %s %s', result.statusCode, result.text)));

        debug('updateContact: contact of user updated to %s', that.email);

        callback();
    });
};

Acme.prototype.registerUser = function (callback) {
    assert.strictEqual(typeof callback, 'function');

    var payload = {
        resource: 'new-reg',
        contact: [ 'mailto:' + this.email ],
        agreement: LE_AGREEMENT
    };

    debug('registerUser: %s', this.email);

    var that = this;
    this.sendSignedRequest(this.caOrigin + '/acme/new-reg', JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering user: ' + error.message));
        if (result.statusCode === 409) return that.updateContact(result.headers.location, callback); // already exists
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to register user. Expecting 201, got %s %s', result.statusCode, result.text)));

        debug('registerUser: registered user %s', that.email);

        callback(null);
    });
};

Acme.prototype.registerDomain = function (domain, callback) {
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

    this.sendSignedRequest(this.caOrigin + '/acme/new-authz', JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when registering domain: ' + error.message));
        if (result.statusCode === 403) return callback(new AcmeError(AcmeError.FORBIDDEN, result.body.detail));
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to register user. Expecting 201, got %s %s', result.statusCode, result.text)));

        debug('registerDomain: registered %s', domain);

        callback(null, result.body);
    });
};

Acme.prototype.prepareHttpChallenge = function (challenge, callback) {
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('prepareHttpChallenge: preparing for challenge %j', challenge);

    var token = challenge.token;

    assert(util.isBuffer(this.accountKeyPem));
    var privateKey = ursa.createPrivateKey(this.accountKeyPem);

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
};

Acme.prototype.notifyChallengeReady = function (challenge, callback) {
    assert.strictEqual(typeof challenge, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('notifyChallengeReady: %s was met', challenge.uri);

    var keyAuthorization = fs.readFileSync(path.join(paths.ACME_CHALLENGES_DIR, challenge.token), 'utf8');

    var payload = {
        resource: 'challenge',
        keyAuthorization: keyAuthorization
    };

    this.sendSignedRequest(challenge.uri, JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when notifying challenge: ' + error.message));
        if (result.statusCode !== 202) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to notify challenge. Expecting 202, got %s %s', result.statusCode, result.text)));

        callback();
    });
};

Acme.prototype.waitForChallenge = function (challenge, callback) {
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
    }, function retryFinished(error) {
        // async.retry will pass 'undefined' as second arg making it unusable with async.waterfall()
        callback(error);
    });
};

// https://community.letsencrypt.org/t/public-beta-rate-limits/4772 for rate limits
Acme.prototype.signCertificate = function (domain, csrDer, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert(util.isBuffer(csrDer));
    assert.strictEqual(typeof callback, 'function');

    var outdir = paths.APP_CERTS_DIR;

    var payload = {
        resource: 'new-cert',
        csr: b64(csrDer)
    };

    debug('signCertificate: sending new-cert request');

    this.sendSignedRequest(this.caOrigin + '/acme/new-cert', JSON.stringify(payload), function (error, result) {
        if (error) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when signing certificate: ' + error.message));
        // 429 means we reached the cert limit for this domain
        if (result.statusCode !== 201) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to sign certificate. Expecting 201, got %s %s', result.statusCode, result.text)));

        var certUrl = result.headers.location;

        if (!certUrl) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Missing location in downloadCertificate'));

        safe.fs.writeFileSync(path.join(outdir, domain + '.url'), certUrl, 'utf8'); // maybe use for renewal

        return callback(null, result.headers.location);
    });
};

Acme.prototype.createKeyAndCsr = function (domain, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof callback, 'function');

    var outdir = paths.APP_CERTS_DIR;
    var csrFile = path.join(outdir, domain + '.csr');
    var privateKeyFile = path.join(outdir, domain + '.key');
    var execSync = safe.child_process.execSync;

    if (safe.fs.existsSync(privateKeyFile)) {
        // in some old releases, csr file was corrupt. so always regenerate it
        debug('createKeyAndCsr: reuse the key for renewal at %s', privateKeyFile);
    } else {
        var key = execSync('openssl genrsa 4096');
        if (!key) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));
        if (!safe.fs.writeFileSync(privateKeyFile, key)) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        debug('createKeyAndCsr: key file saved at %s', privateKeyFile);
    }

    var csrDer = execSync(util.format('openssl req -new -key %s -outform DER -subj /CN=%s', privateKeyFile, domain));
    if (!csrDer) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));
    if (!safe.fs.writeFileSync(csrFile, csrDer)) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error)); // bookkeeping

    debug('createKeyAndCsr: csr file (DER) saved at %s', csrFile);

    callback(null, csrDer);
};

// TODO: download the chain in a loop following 'up' header
Acme.prototype.downloadChain = function (linkHeader, callback) {
    if (!linkHeader) return new AcmeError(AcmeError.EXTERNAL_ERROR, 'Empty link header when downloading certificate chain');

    var linkInfo = parseLinks(linkHeader);
    if (!linkInfo || !linkInfo.up) return new AcmeError(AcmeError.EXTERNAL_ERROR, 'Failed to parse link header when downloading certificate chain'); 

    debug('downloadChain: downloading from %s', linkInfo.up);

    superagent.get(linkInfo.up).buffer().parse(function (res, done) {
        var data = [ ];
        res.on('data', function(chunk) { data.push(chunk); });
        res.on('end', function () { res.text = Buffer.concat(data); done(); });
    }).end(function (error, result) {
        if (error && !error.response) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when downloading certificate'));
        if (result.statusCode !== 200) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to get cert. Expecting 200, got %s %s', result.statusCode, result.text)));

        var chainDer = result.text;
        var execSync = safe.child_process.execSync;

        var chainPem = execSync('openssl x509 -inform DER -outform PEM', { input: chainDer }); // this is really just base64 encoding with header
        if (!chainPem) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        callback(null, chainPem);
    });
};

Acme.prototype.downloadCertificate = function (domain, certUrl, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof certUrl, 'string');
    assert.strictEqual(typeof callback, 'function');

    var outdir = paths.APP_CERTS_DIR;
    var that = this;

    superagent.get(certUrl).buffer().parse(function (res, done) {
        var data = [ ];
        res.on('data', function(chunk) { data.push(chunk); });
        res.on('end', function () { res.text = Buffer.concat(data); done(); });
    }).end(function (error, result) {
        if (error && !error.response) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'Network error when downloading certificate'));
        if (result.statusCode === 202) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, 'Retry not implemented yet'));
        if (result.statusCode !== 200) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, util.format('Failed to get cert. Expecting 200, got %s %s', result.statusCode, result.text)));

        var certificateDer = result.text;
        var execSync = safe.child_process.execSync;

        safe.fs.writeFileSync(path.join(outdir, domain + '.der'), certificateDer);
        debug('downloadCertificate: cert der file for %s saved', domain);

        var certificatePem = execSync('openssl x509 -inform DER -outform PEM', { input: certificateDer }); // this is really just base64 encoding with header
        if (!certificatePem) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        that.downloadChain(result.header['link'], function (error, chainPem) {
            if (error) return callback(error);

            var certificateFile = path.join(outdir, domain + '.cert');
            var fullChainPem = Buffer.concat([certificatePem, chainPem]);
            if (!safe.fs.writeFileSync(certificateFile, fullChainPem)) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

            debug('downloadCertificate: cert file for %s saved at %s', domain, certificateFile);

            callback();
        });
    });
};

Acme.prototype.acmeFlow = function (domain, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (!fs.existsSync(paths.ACME_ACCOUNT_KEY_FILE)) {
        debug('getCertificate: generating acme account key on first run');
        this.accountKeyPem = safe.child_process.execSync('openssl genrsa 4096');
        if (!this.accountKeyPem) return callback(new AcmeError(AcmeError.INTERNAL_ERROR, safe.error));

        safe.fs.writeFileSync(paths.ACME_ACCOUNT_KEY_FILE, this.accountKeyPem);
    } else {
        debug('getCertificate: using existing acme account key');
        this.accountKeyPem = fs.readFileSync(paths.ACME_ACCOUNT_KEY_FILE);
    }

    var that = this;
    this.registerUser(function (error) {
        if (error) return callback(error);

        that.registerDomain(domain, function (error, result) {
            if (error) return callback(error);

            debug('acmeFlow: challenges: %j', result);

            var httpChallenges = result.challenges.filter(function(x) { return x.type === 'http-01'; });
            if (httpChallenges.length === 0) return callback(new AcmeError(AcmeError.EXTERNAL_ERROR, 'no http challenges'));
            var challenge = httpChallenges[0];

            async.waterfall([
                that.prepareHttpChallenge.bind(that, challenge),
                that.notifyChallengeReady.bind(that, challenge),
                that.waitForChallenge.bind(that, challenge),
                that.createKeyAndCsr.bind(that, domain),
                that.signCertificate.bind(that, domain),
                that.downloadCertificate.bind(that, domain)
            ], callback);
        });
    });
};

Acme.prototype.getCertificate = function (domain, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('getCertificate: start acme flow for %s from %s', domain, this.caOrigin);
    this.acmeFlow(domain, function (error) {
        if (error) return callback(error);

        var outdir = paths.APP_CERTS_DIR;
        callback(null, path.join(outdir, domain + '.cert'), path.join(outdir, domain + '.key'));
    });
};

function getCertificate(domain, options, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    var acme = new Acme(options || { });
    acme.getCertificate(domain, callback);
}
