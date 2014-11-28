'use strict';

var assert = require('assert'),
    Docker = require('dockerode'),
    fs = require('fs'),
    os = require('os'),
    path = require('path');

exports = module.exports = (function () {
    var docker;
    var options = connectOptions(); // the real docker

    if (process.env.NODE_ENV === 'test') {
        // test code runs a docker proxy on this port
        docker = new Docker({ host: 'http://localhost', port: 5687 });
    } else {
        docker = new Docker(options);
    }

    // proxy code uses this to route to the real docker
    docker.options = options;

    return docker;
})();

function connectOptions() {
    if (os.platform() === 'linux') return { socketPath: '/var/run/docker.sock' };

    // boot2docker configuration
    var DOCKER_CERT_PATH = process.env.DOCKER_CERT_PATH || path.join(process.env.HOME, '.boot2docker/certs/boot2docker-vm');

    return {
        protocol: 'https',
        host: '192.168.59.103', // maybe parse from DOCKER_HOST?
        port: 2376,
        ca: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'ca.pem')),
        cert: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'cert.pem')),
        key: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'key.pem'))
    };
}

