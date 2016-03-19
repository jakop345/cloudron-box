/* jslint node:true */

'use strict';

var acme = require('./cert/acme.js'),
    apps = require('./apps.js'),
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
    tld = require('tldjs'),
    user = require('./user.js'),
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

        // registering user with an email requires A or MX record (https://github.com/letsencrypt/boulder/issues/1197)
        // we cannot use admin@fqdn because the user might not have set it up.
        // we simply update the account with the latest email we have each time when getting letsencrypt certs
        // https://github.com/ietf-wg-acme/acme/issues/30
        user.getOwner(function (error, owner) {
            options.email = error ? 'admin@cloudron.io' : owner.email; // can error if not activated yet

            callback(null, api, options);
        });
    });
}

function installAdminCertificate(callback) {
    if (cloudron.isConfiguredSync()) return callback();

    settings.getTlsConfig(function (error, tlsConfig) {
        if (error) return callback(error);

        if (tlsConfig.provider === 'caas') return callback();

        sysinfo.getIp(function (error, ip) {
            if (error) return callback(error);

            var zoneName = tld.getDomain(config.fqdn());
            waitForDns(config.adminFqdn(), ip, zoneName, function (error) {
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
    });
}

function isExpiringSync(hours, certFilePath) {
    assert.strictEqual(typeof hours, 'number');
    assert.strictEqual(typeof certFilePath, 'string');

    var result = safe.child_process.spawnSync('/usr/bin/openssl', [ 'x509', '-checkend', new String(60 * 60 * hours), '-in', certFilePath ]);

    debug('isExpiringSync: %s %s %s', certFilePath, result.stdout.toString('utf8'), result.status);

    return result.status === 1; // 1 - expired 0 - not expired
}

function autoRenew(callback) {
    debug('autoRenew: Checking certificates for renewal');
    callback = callback || NOOP_CALLBACK;

    apps.getAll(function (error, allApps) {
        if (error) return callback(error);

        var expiringApps = [ ];
        for (var i = 0; i < allApps.length; i++) {
            var appDomain = config.appFqdn(allApps[i].location);
            var certFile = path.join(paths.APP_CERTS_DIR, appDomain + '.cert');
            if (!safe.fs.existsSync(certFile)) {
                debug('autoRenew: no existing certificate for %s. skipping', appDomain);
                continue;
            }

            if (!isExpiringSync(24 * 30, certFile)) {
                debug('autoRenew: %s does not need renewal', appDomain);
                continue;
            }

            expiringApps.push(allApps[i]);
        }

        debug('autoRenew: %j needs to be renewed', expiringApps.map(function (a) { return config.appFqdn(a.location); }));

        getApi(function (error, api, apiOptions) {
            if (error) return callback(error);

            async.eachSeries(expiringApps, function iterator(app, iteratorCallback) {
                var domain = config.appFqdn(app.location);
                debug('autoRenew: renewing cert for %s with options %j', domain, apiOptions);

                api.getCertificate(domain, apiOptions, function (error) {
                    if (!error) {
                        debug('autoRenew: certificate for %s renewed', domain);
                        return iteratorCallback();
                    }

                    debug('autoRenew: could not renew cert for %s because %s. using fallback certs', domain, error);

                    nginx.configureApp(app, 'cert/host.cert', 'cert/host.key', function (ignoredError) {
                        if (ignoredError) debug('autoRenew: error reconfiguring app', ignoredError);

                        iteratorCallback(); // move to next app
                    });
                });
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

        if (!isExpiringSync(userCertFilePath)) return callback(null, userCertFilePath, userKeyFilePath);

        debug('ensureCertificate: %s cert require renewal', domain);
    }

    getApi(function (error, api, apiOptions) {
        if (error) return callback(error);

        debug('ensureCertificate: getting certificate for %s with options %j', domain, apiOptions);

        api.getCertificate(domain, apiOptions, function (error, certFilePath, keyFilePath) {
            if (error) {
                debug('ensureCertificate: could not get certificate. using fallback certs', error);
                return callback(null, 'cert/host.cert', 'cert/host.key'); // use fallback certs
            }

            callback(null, certFilePath, keyFilePath);
        });
    });
}
