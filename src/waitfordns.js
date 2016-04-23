'use strict';

exports = module.exports = waitForDns;

var assert = require('assert'),
    async = require('async'),
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
function waitForDns(domain, value, type, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof value, 'string');
    assert(type === 'A' || type === 'CNAME');
    assert.strictEqual(typeof callback, 'function');

    var zoneName = tld.getDomain(domain);
    debug('waitForIp: domain %s to be %s in zone %s.', domain, value, zoneName);

    var attempt = 1;
    async.retry({ interval: 5000, times: 50000 }, function (retryCallback) {
        debug('waitForDNS: %s attempt %s.', domain, attempt++);

        dns.resolveNs(zoneName, function (error, nameservers) {
            if (error || !nameservers) return retryCallback(error || new Error('Unable to get nameservers'));

            async.every(nameservers, isChangeSynced.bind(null, domain, value, type), function (synced) {
                debug('waitForIp: %s %s ns: %j', domain, synced ? 'done' : 'not done', nameservers);

                retryCallback(synced ? null : new Error('ETRYAGAIN'));
            });
        });
    }, function retryDone(error) {
         if (error) return callback(error);

        debug('waitForDNS: %s done.', domain);

        callback(null);
     });
}
