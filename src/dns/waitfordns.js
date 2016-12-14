'use strict';

exports = module.exports = waitForDns;

var assert = require('assert'),
    async = require('async'),
    debug = require('debug')('box:dns/waitfordns'),
    dns = require('native-dns'),
    SubdomainError = require('../subdomains.js').SubdomainError,
    tld = require('tldjs');

// the first arg to callback is not an error argument; this is required for async.every
function isChangeSynced(domain, value, type, nameserver, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof nameserver, 'string');
    assert.strictEqual(typeof callback, 'function');

    // ns records cannot have cname
    dns.resolve4(nameserver, function (error, nsIps) {
        if (error || !nsIps || nsIps.length === 0) {
            debug('nameserver %s does not resolve. assuming it stays bad.', nameserver); // it's fine if one or more ns are dead
            return callback(true);
        }

        async.every(nsIps, function (nsIp, iteratorCallback) {
            var req = dns.Request({
                question: dns.Question({ name: domain, type: type }),
                server: { address: nsIp },
                timeout: 5000
            });

            req.on('timeout', function () {
                debug('nameserver %s (%s) timed out when trying to resolve %s', nameserver, nsIp, domain);
                return iteratorCallback(true); // should be ok if dns server is down
            });

            req.on('message', function (error, message) {
                if (error) {
                    debug('nameserver %s (%s) returned error trying to resolve %s: %s', nameserver, nsIp, domain, error);
                    return iteratorCallback(false);
                }

                var answer = message.answer;

                if (!answer || answer.length === 0) {
                    debug('bad answer from nameserver %s (%s) resolving %s (%s): %j', nameserver, nsIp, domain, type, message);
                    return iteratorCallback(false);
                }

                debug('isChangeSynced: ns: %s (%s), name:%s Actual:%j Expecting:%s', nameserver, nsIp, domain, answer, value);

                var match = answer.some(function (a) {
                    return ((type === 'A' && a.address === value) || (type === 'CNAME' && a.data === value));
                });

                if (match) return iteratorCallback(true); // done!

                iteratorCallback(false);
            });

            req.send();
        }, callback);
    });
 }

// check if IP change has propagated to every nameserver
function waitForDns(domain, value, type, options, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof value, 'string');
    assert(type === 'A' || type === 'CNAME');
    assert(options && typeof options === 'object'); // { interval: 5000, times: 50000 }
    assert.strictEqual(typeof callback, 'function');

    var zoneName = tld.getDomain(domain);
    debug('waitForIp: domain %s to be %s in zone %s.', domain, value, zoneName);

    var attempt = 1;
    async.retry(options, function (retryCallback) {
        debug('waitForDNS: %s attempt %s.', domain, attempt++);

        dns.resolveNs(zoneName, function (error, nameservers) {
            if (error || !nameservers) return retryCallback(error || new SubdomainError(SubdomainError.EXTERNAL_ERROR, 'Unable to get nameservers'));

            async.every(nameservers, isChangeSynced.bind(null, domain, value, type), function (synced) {
                debug('waitForIp: %s %s ns: %j', domain, synced ? 'done' : 'not done', nameservers);

                retryCallback(synced ? null : new SubdomainError(SubdomainError.EXTERNAL_ERROR, 'ETRYAGAIN'));
            });
        });
    }, function retryDone(error) {
         if (error) return callback(error);

        debug('waitForDNS: %s done.', domain);

        callback(null);
     });
}
