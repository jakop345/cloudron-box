'use strict';

var Docker = require('dockerode'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    url = require('url');

exports = module.exports = (function () {
    var docker;
    var options = connectOptions(); // the real docker

    if (process.env.BOX_ENV === 'test') {
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
    var DOCKER_HOST = process.env.DOCKER_HOST || 'tcp://192.168.59.103:2376';

    return {
        protocol: 'https',
        host: url.parse(DOCKER_HOST).hostname,
        port: url.parse(DOCKER_HOST).port,
        ca: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'ca.pem')),
        cert: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'cert.pem')),
        key: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'key.pem'))
    };
}

