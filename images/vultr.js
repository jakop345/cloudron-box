#!/usr/bin/env node

'use strict';

require('colors');

var request = require('superagent-sync');

function exit(error, result) {
	if (error) console.error(error.message.red);
    if (result) console.log(result);

	process.exit(error ? 1 : 0);
}

var gApiToken = process.env.VULTR_TOKEN;
if (!gApiToken) exit(new Error('Script requires VULTR_TOKEN env to be set'));

if (process.argv.length < 3) {
	exit(new Error('Usage: vultr <cmd> <args...>'));
}

function getSshKeyId(keyName, callback) {
    var res = request.get('https://api.vultr.com/v1/sshkey/list')
        .query({ api_key : gApiToken })
        .end();

    if (res.statusCode !== 200) exit(new Error('Invalid response'));

    var allKeyIds = Object.keys(res.body);
    for (var i = 0; i < allKeyIds.length; i++) {
        if (keyName === res.body[allKeyIds[i]].name) return callback(null, allKeyIds[i]); // also SSHKEYID
    }

    callback(new Error('key not found'));
}

function create(keyId, name, callback) {
    var regionId = 5; // LA (https://api.vultr.com/v1/regions/list)
    var planId = 29;  // 768MB RAM (https://api.vultr.com/v1/regions/list)
    var osid = 191; // Ubuntu 15.04 x64 (see https://api.vultr.com/v1/os/list)

    var res = request.post('https://api.vultr.com/v1/server/create')
        .query({ api_key : gApiToken })
        .type('form')
        .send({ DCID: regionId, VPSPLANID: planId, OSID : osid, label: name, SSHKEYID: keyId })
        .end();

    if (res.statusCode !== 200) return callback(new Error('Invalid response creating server'));

    return callback(null, res.body.SUBID);
}

function getIp(id, callback){
    var res = request.post('https://api.vultr.com/v1/server/list')
        .query({ api_key : gApiToken })
        .end();

    var info = res.body[id];
    if (!info) return callback(new Error('Invalid response querying IP'));

    if (info.power_status !== 'running' || info.server_state !== 'ok' || info.status !== 'active') return callback(new Error('Server is not up yet'));

    return callback(null, info.main_ip);
}

switch (process.argv[2]) {
case 'get_ssh_key_id':
    getSshKeyId(process.argv[3], exit);
    break;

case 'create':
    create(process.argv[3], process.argv[4], exit);
    break;

case 'get_ip':
    getIp(process.argv[3], exit);
    break;

case 'get_id':


case 'power_on':

case 'power_off':

case 'snapshot':

case 'destroy':

case 'wait_for_image_event':

case 'transfer_image':
    exit(new Error('Unimplemented command:' + process.argv[2]));

    break;

default:
    exit(new Error('Unknown command:' + process.argv[2]));
}
