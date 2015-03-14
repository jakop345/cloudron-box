'use strict';

var assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('box:vbox.js'),
    os = require('os');

exports = module.exports = {
    forwardFromHostToVirtualBox: forwardFromHostToVirtualBox,
    unforwardFromHostToVirtualBox: unforwardFromHostToVirtualBox
};

function forwardFromHostToVirtualBox(rulename, port) {
    assert(typeof rulename === 'string');
    assert(typeof port === 'number');

    if (os.platform() === 'darwin') {
        debug('Setting up VirtualBox port forwarding for '+ rulename + ' at ' + port);
        child_process.exec(
            'VBoxManage controlvm boot2docker-vm natpf1 delete ' + rulename + ';' +
            'VBoxManage controlvm boot2docker-vm natpf1 ' + rulename + ',tcp,127.0.0.1,' + port + ',,' + port);
    }
}

function unforwardFromHostToVirtualBox(rulename) {
    assert(typeof rulename === 'string');

    if (os.platform() === 'darwin') {
        debug('Removing VirtualBox port forwarding for '+ rulename);
        child_process.exec('VBoxManage controlvm boot2docker-vm natpf1 delete ' + rulename);
    }
}

