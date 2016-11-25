'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    os = require('os'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    // replace 1.2.3.4 with the public IP to reach the server
    return callback(null, '1.2.3.4');

    /*try {
        var interfaces = os.networkInterfaces();
        // https://www.freedesktop.org/wiki/Software/systemd/PredictableNetworkInterfaceNames/
        for (var ifname in interfaces) {
            if (!ifname.match(/^(en|eth)/)) continue;

            for (var obj of interfaces[ifname]) { // array
                if (obj.family === 'IPv4') return callback(null, obj.address);
            }
        }

        return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, new Error('Could not find interface')));
    } catch (e) {
        return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, e));
    }*/
}

