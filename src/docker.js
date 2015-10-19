'use strict';

var Docker = require('dockerode');

var gConnection = connectionInstance();

exports = module.exports = gConnection;

function connectionInstance() {
    var docker;

    if (process.env.BOX_ENV === 'test') {
        // test code runs a docker proxy on this port
        docker = new Docker({ host: 'http://localhost', port: 5687 });

        // proxy code uses this to route to the real docker
        docker.options = { socketPath: '/var/run/docker.sock' };
    } else {
        docker = new Docker({ socketPath: '/var/run/docker.sock' });
    }

    return docker;
}
