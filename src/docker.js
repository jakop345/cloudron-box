'use strict';

var Docker = require('dockerode'),
    os = require('os');

exports = module.exports = (function () {
    var docker;

    if (process.env.NODE_ENV === 'test') {
        // test code runs a docker proxy on this port
        docker = new Docker({ host: 'http://localhost', port: 5687 });
    } else {
        docker = new Docker(connectOptions());
    }

    // proxy code uses this to route to the real docker
    docker.options = connectOptions();

    return docker;
})();

function connectOptions() {
    if (os.platform() === 'linux') return { socketPath: '/var/run/docker.sock' };

    return { host: 'http://localhost', port: 2375 };
}

