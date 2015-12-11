/* jslint node:true */

'use strict';

var acme = require('./cert/acme.js'),
    assert = require('assert'),
    config = require('./config.js'),
    debug = require('debug')('src/certificates'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    sysinfo = require('./sysinfo.js'),
    util = require('util'),
    x509 = require('x509');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    autoRenew: autoRenew,
    validateCertificate: validateCertificate
};

function initialize(callback) {
    if (!config.isCustomDomain()) return callback();

    callback();
    // TODO: check if dns is in sync first!

    // acme.getCertificate(config.adminFqdn(), paths.APP_CERTS_DIR, function (error) {
        // copy to nginx cert dir
        // reload nginx
    // });
}

function uninitialize(callback) {
    callback();
}

function autoRenew() {
    debug('will automatically renew certs');
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
