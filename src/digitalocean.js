/* jslint node:true */

'use strict';

var debug = require('debug')('box:digitalocean'),
    dns = require('native-dns'),
    assert = require('assert');

exports = module.exports = {
    checkPtrRecord: checkPtrRecord
};

function checkPtrRecord(ip, fqdn, callback) {
    assert(typeof ip === 'string');
    assert(typeof fqdn === 'string');
    assert(typeof callback === 'function');

    debug('checkPtrRecord: ' + ip);

    dns.resolve4('ns1.digitalocean.com', function (error, rdnsIps) {
        if (error || rdnsIps.length === 0) return callback(new Error('Failed to query DO DNS'));

        var reversedIp = ip.split('.').reverse().join('.');

        var req = dns.Request({
            question: dns.Question({ name: reversedIp + '.in-addr.arpa', type: 'PTR' }),
            server: { address: rdnsIps[0] },
            timeout: 5000
        });

        req.on('timeout', function () { return callback(new Error('Timedout')); });

        req.on('message', function (error, message) {
            if (error || !message.answer || message.answer.length === 0) return callback(new Error('Failed to query PTR'));

            debug('checkPtrRecord: Actual:%s Expecting:%s', message.answer[0].data, fqdn);
            callback(null, message.answer[0].data === fqdn);
        });

        req.send();
    });
}


