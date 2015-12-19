/* jslint node:true */

'use strict';

var acme = require('./cert/acme.js'),
    assert = require('assert'),
    async = require('async'),
    caas = require('./cert/caas.js'),
    cloudron = require('./cloudron.js'),
    config = require('./config.js'),
    constants = require('./constants.js'),
    debug = require('debug')('box:src/certificates'),
    fs = require('fs'),
    nginx = require('./nginx.js'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    settings = require('./settings.js'),
    sysinfo = require('./sysinfo.js'),
    util = require('util'),
    waitForDns = require('./waitfordns.js'),
    x509 = require('x509');

exports = module.exports = {
    installAdminCertificate: installAdminCertificate,
    autoRenew: autoRenew,
    setFallbackCertificate: setFallbackCertificate,
    setAdminCertificate: setAdminCertificate,
    CertificatesError: CertificatesError,
    validateCertificate: validateCertificate,
    ensureCertificate: ensureCertificate
};

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

function CertificatesError(reason, errorOrMessage) {
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
util.inherits(CertificatesError, Error);
CertificatesError.INTERNAL_ERROR = 'Internal Error';
CertificatesError.INVALID_CERT = 'Invalid certificate';

function getApi(callback) {
    settings.getTlsConfig(function (error, tlsConfig) {
        if (error) return callback(error);

        var api = tlsConfig.provider === 'caas' ? caas : acme;

        var options = { };
        options.prod = tlsConfig.provider.match(/.*-prod/) !== null;

        callback(null, api, options);
    });
}

function installAdminCertificate(callback) {
    if (cloudron.isConfiguredSync()) return callback();

    settings.getTlsConfig(function (error, tlsConfig) {
        if (error) return callback(error);

        if (tlsConfig.provider === 'caas') return callback();

        waitForDns(config.adminFqdn(), sysinfo.getIp(), config.fqdn(), function (error) {
            if (error) return callback(error); // this cannot happen because we retry forever

            ensureCertificate(config.adminFqdn(), function (error, certFilePath, keyFilePath) {
                if (error) { // currently, this can never happen
                    debug('Error obtaining certificate. Proceed anyway', error);
                    return callback();
                }

                nginx.configureAdmin(certFilePath, keyFilePath, callback);
            });
        });
    });
}

function needsRenewalSync(certFilePath) {
    var result = safe.child_process.execSync('openssl x509 -checkend %s -in %s', 60 * 60 * 24 * 5, certFilePath);

    return result === null; // command errored
}

function autoRenew(callback) {
    debug('autoRenew: Checking certificates for renewal');
    callback = callback || NOOP_CALLBACK;

    var filenames = safe.fs.readdirSync(paths.APP_CERTS_DIR);
    if (!filenames) {
        debug('autoRenew: Error getting filenames: %s', safe.error.message);
        return;
    }

    var certs = filenames.filter(function (f) {
        return f.match(/\.cert$/) !== null && needsRenewalSync(path.join(paths.APP_CERTS_DIR, f));
    });

    debug('autoRenew: %j needs to be renewed', certs);

    getApi(function (error, api, apiOptions) {
        if (error) return callback(error);

        async.eachSeries(certs, function iterator(cert, iteratorCallback) {
            var domain = cert.match(/^(.*)\.cert$/)[1];
            if (domain === 'host') return iteratorCallback(); // cannot renew fallback cert

            debug('autoRenew: renewing cert for %s with options %j', domain, apiOptions);

            api.getCertificate(domain, apiOptions, function (error) {
                if (error) debug('autoRenew: could not renew cert for %s', domain, error);

                iteratorCallback(); // move on to next cert
            });
        });
    });
}

// note: https://tools.ietf.org/html/rfc4346#section-7.4.2 (certificate_list) requires that the
// servers certificate appears first (and not the intermediate cert)
function validateCertificate(cert, key, fqdn) {
    assert(cert === null || typeof cert === 'string');
    assert(key === null || typeof key === 'string');
    assert.strictEqual(typeof fqdn, 'string');

    if (cert === null && key === null) return null;
    if (!cert && key) return new Error('missing cert');
    if (cert && !key) return new Error('missing key');

    var content;
    try {
        content = x509.parseCert(cert);
    } catch (e) {
        return new Error('invalid cert: ' + e.message);
    }

    // check expiration
    if (content.notAfter < new Date()) return new Error('cert expired');

    function matchesDomain(domain) {
        if (domain === fqdn) return true;
        if (domain.indexOf('*') === 0 && domain.slice(2) === fqdn.slice(fqdn.indexOf('.') + 1)) return true;

        return false;
    }

    // check domain
    var domains = content.altNames.concat(content.subject.commonName);
    if (!domains.some(matchesDomain)) return new Error(util.format('cert is not valid for this domain. Expecting %s in %j', fqdn, domains));

    // http://httpd.apache.org/docs/2.0/ssl/ssl_faq.html#verify
    var certModulus = safe.child_process.execSync('openssl x509 -noout -modulus', { encoding: 'utf8', input: cert });
    var keyModulus = safe.child_process.execSync('openssl rsa -noout -modulus', { encoding: 'utf8', input: key });
    if (certModulus !== keyModulus) return new Error('key does not match the cert');

    return null;
}

function setFallbackCertificate(cert, key, callback) {
    assert.strictEqual(typeof cert, 'string');
    assert.strictEqual(typeof key, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateCertificate(cert, key, '*.' + config.fqdn());
    if (error) return callback(new CertificatesError(CertificatesError.INVALID_CERT, error.message));

    // backup the cert
    if (!safe.fs.writeFileSync(path.join(paths.APP_CERTS_DIR, 'host.cert'), cert)) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, safe.error.message));
    if (!safe.fs.writeFileSync(path.join(paths.APP_CERTS_DIR, 'host.key'), key)) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, safe.error.message));

    // copy over fallback cert
    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), cert)) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, safe.error.message));
    if (!safe.fs.writeFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), key)) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, safe.error.message));

    nginx.reload(function (error) {
        if (error) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function setAdminCertificate(cert, key, callback) {
    assert.strictEqual(typeof cert, 'string');
    assert.strictEqual(typeof key, 'string');
    assert.strictEqual(typeof callback, 'function');

    var vhost = config.appFqdn(constants.ADMIN_LOCATION);
    var certFilePath = path.join(paths.APP_CERTS_DIR, vhost + '.cert');
    var keyFilePath = path.join(paths.APP_CERTS_DIR, vhost + '.key');

    var error = validateCertificate(cert, key, vhost);
    if (error) return callback(new CertificatesError(CertificatesError.INVALID_CERT, error.message));

    // backup the cert
    if (!safe.fs.writeFileSync(certFilePath, cert)) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, safe.error.message));
    if (!safe.fs.writeFileSync(keyFilePath, key)) return callback(new CertificatesError(CertificatesError.INTERNAL_ERROR, safe.error.message));

    nginx.configureAdmin(certFilePath, keyFilePath, callback);
}

function ensureCertificate(domain, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof callback, 'function');

    // check if user uploaded a specific cert. ideally, we should not mix user certs and automatic certs as we do here...
    var userCertFilePath = path.join(paths.APP_CERTS_DIR, domain + '.cert');
    var userKeyFilePath = path.join(paths.APP_CERTS_DIR, domain + '.key');

    if (fs.existsSync(userCertFilePath) && fs.existsSync(userKeyFilePath)) {
        debug('ensureCertificate: %s. certificate already exists at %s', domain, userKeyFilePath);

        if (!needsRenewalSync(userCertFilePath)) return callback(null, userCertFilePath, userKeyFilePath);

        debug('ensureCertificate: %s cert require renewal', domain);
    }

    getApi(function (error, api, apiOptions) {
        if (error) return callback(error);

        debug('ensureCertificate: getting certificate for %s with options %j', domain, options);

        api.getCertificate(domain, apiOptions, function (error, certFilePath, keyFilePath) {
            if (error) {
                debug('ensureCertificate: could not get certificate. using fallback certs', error);
                return callback(null, 'cert/host.cert', 'cert/host.key'); // use fallback certs
            }

            callback(null, certFilePath, keyFilePath);
        });
    });
}
