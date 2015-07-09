'use strict';

exports = module.exports = {
    getIp: getIp
};

var os = require('os');

var gCachedIp = null;

function getIp() {
    if (gCachedIp) return gCachedIp;

    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        if (dev.match(/^(en|eth|wlp).*/) === null) continue;

        for (var i = 0; i < ifaces[dev].length; i++) {
            if (ifaces[dev][i].family === 'IPv4') {
                gCachedIp = ifaces[dev][i].address;
                return gCachedIp;
            }
        }
    }

    return null;
}

