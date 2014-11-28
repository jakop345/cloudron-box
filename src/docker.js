'use strict';

var Docker = require('dockerode');

exports = module.exports = (function () {
    var docker;

    if (process.env.NODE_ENV === 'test') {
        docker = new Docker({ host: 'http://localhost', port: 5687 });
    } else if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 2375 });
    }

    return docker;
})();

