'use strict';

exports = module.exports = waitForDns;

var assert = require('assert'),
    async = require('async'),
    attempt = require('attempt'),
    debug = require('debug')('box:src/waitfordns'),
    dns = require('native-dns'),
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
        if (error || !nsIps || nsIps.length === 0) return callback(false);

        async.every(nsIps, function (nsIp, iteratorCallback) {
            var req = dns.Request({
                question: dns.Question({ name: domain, type: type }),
                server: { address: nsIp },
                timeout: 5000
            });

            req.on('timeout', function () { return iteratorCallback(false); });

            req.on('message', function (error, message) {
                if (error) return iteratorCallback(false);

                var answer = type === 'A' ? message.answer : message.data;

                if (!answer || answer.length === 0) return iteratorCallback(false);

                debug('isChangeSynced: ns: %s (%s), name:%s Actual:%j Expecting:%s', nameserver, nsIp, domain, answer[0], value);

                if (answer[0].address !== value) return iteratorCallback(false);

                iteratorCallback(true); // done
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

    var defaultOptions = {
        retryInterval: 5000,
        retries: Infinity
    };

    if (typeof options === 'function') {
        callback = options;
        options = defaultOptions;
    } else {
        assert.strictEqual(typeof options, 'object');
        assert.strictEqual(typeof callback, 'function');
    }

    var zoneName = tld.getDomain(zoneName);
    debug('waitForIp: domain %s to be %s in zone %s.', domain, value, zoneName);

    attempt(function (attempts) {
        var callback = this; // gross
        debug('waitForDNS: %s attempt %s.', domain, attempts);

        dns.resolveNs(zoneName, function (error, nameservers) {
            if (error || !nameservers) return callback(error || new Error('Unable to get nameservers'));

            async.every(nameservers, isChangeSynced.bind(null, domain, value, type), function (synced) {
                debug('waitForIp: %s %s ns: %j', domain, synced ? 'done' : 'not done', nameservers);

                callback(synced ? null : new Error('ETRYAGAIN'));
            });
        });
    }, { interval: options.retryInterval, retries: options.retries }, function (error) {
         if (error) return callback(error);

        debug('waitForDNS: %s done.', domain);

        callback(null);
     });
}
