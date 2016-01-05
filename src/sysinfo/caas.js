'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    os = require('os'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        if (dev.match(/^(en|eth|wlp).*/) === null) continue;

        for (var i = 0; i < ifaces[dev].length; i++) {
            if (ifaces[dev][i].family === 'IPv4') {
                return callback(null, ifaces[dev][i].address);
            }
        }
    }

    callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));
}
