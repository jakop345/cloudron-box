'use strict';

// we can possibly remove this entire file and make our tests
// smarter to just use the host interface provided by boot2docker
// https://github.com/boot2docker/boot2docker#container-port-redirection
// https://github.com/boot2docker/boot2docker/pull/93
// https://github.com/docker/docker/issues/4007

var assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('box:vbox'),
    os = require('os');

exports = module.exports = {
    forwardFromHostToVirtualBox: forwardFromHostToVirtualBox,
    unforwardFromHostToVirtualBox: unforwardFromHostToVirtualBox
};

function forwardFromHostToVirtualBox(rulename, port) {
    assert.strictEqual(typeof rulename, 'string');
    assert.strictEqual(typeof port, 'number');

    if (os.platform() === 'darwin') {
        debug('Setting up VirtualBox port forwarding for '+ rulename + ' at ' + port);
        child_process.exec(
            'VBoxManage controlvm boot2docker-vm natpf1 delete ' + rulename + ';' +
            'VBoxManage controlvm boot2docker-vm natpf1 ' + rulename + ',tcp,127.0.0.1,' + port + ',,' + port);
    }
}

function unforwardFromHostToVirtualBox(rulename) {
    assert.strictEqual(typeof rulename, 'string');

    if (os.platform() === 'darwin') {
        debug('Removing VirtualBox port forwarding for '+ rulename);
        child_process.exec('VBoxManage controlvm boot2docker-vm natpf1 delete ' + rulename);
    }
}

