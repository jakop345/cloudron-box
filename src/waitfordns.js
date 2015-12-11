/* jslint node:true */

'use strict';

exports = module.exports = waitForDns;

var assert = require('assert'),
    async = require('async'),
    attempt = require('attempt'),
    debug = require('debug')('src/waitfordns.js'),
    dns = require('native-dns');

// the first arg to callback is not an error argument; this is required for async.every
function isChangeSynced(domain, ip, nameserver, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof nameserver, 'string');
    assert.strictEqual(typeof callback, 'function');

    // ns records cannot have cname
    dns.resolve4(nameserver, function (error, nsIps) {
        if (error || !nsIps || nsIps.length === 0) return callback(false);

        async.every(nsIps, function (nsIp, iteratorCallback) {
            var req = dns.Request({
                question: dns.Question({ name: domain, type: 'A' }),
                server: { address: nsIp },
                timeout: 5000
            });

            req.on('timeout', function () { return iteratorCallback(false); });

            req.on('message', function (error, message) {
                if (error || !message.answer || message.answer.length === 0) return iteratorCallback(false);

                debug('isChangeSynced: ns: %s (%s), name:%s Actual:%j Expecting:%s', nameserver, nsIp, domain, message.answer[0], ip);

                if (message.answer[0].address !== ip) return iteratorCallback(false);

                iteratorCallback(true); // done
            });

            req.send();
        }, callback);
    });
 }

// check if IP change has propagated to every nameserver
function waitForDns(domain, ip, zoneName, options, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof zoneName, 'string');

    var defaultOptions = {
        retryInterval: 5000,
        retries: 6 * 10
    };

    if (typeof options === 'function') {
        callback = options;
        options = defaultOptions;
    } else {
        assert.strictEqual(typeof options, 'object');
        assert.strictEqual(typeof callback, 'function');
    }

    debug('waitForDNS: domain %s to be %s.', domain, ip);

    attempt(function (attempts) {
        var callback = this; // gross
        debug('waitForDNS: %s attempt %s.', domain, attempts);

        dns.resolveNs(zoneName, function (error, nameservers) {
            if (error || !nameservers) return callback(error || new Error('Unable to get nameservers'));

            async.every(nameservers, isChangeSynced.bind(null, domain, ip), function (synced) {
                debug('waitForDNS: %s %s ns: %j', domain, synced ? 'done' : 'not done', nameservers);

                callback(synced ? null : new Error('ETRYAGAIN'));
            });
        });
    }, { interval: options.retryInterval, retries: options.retries }, function (error) {
         if (error) return callback(error);

        debug('waitForDNS: %s done.', domain);

        callback(null);
     });
}
