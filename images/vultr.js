#!/usr/bin/env node

'use strict';

require('colors');

var request = require('superagent-sync');

function exit(error, result) {
	if (error) console.error(error.message.red);
    if (result) console.log(result);

	process.exit(error ? 1 : 0);
}

var gApiToken = process.env.API_TOKEN;
if (!gApiToken) exit('Script requires API_TOKEN env to be set');

if (process.argv.length < 3) {
	exit('Usage: vultr <cmd> <args...>');
}

function getSshKeyId(keyName) {
    request.get('https://api.vultr.com/v1/sshkey/list')
        .query({ api_key : gApiToken })
        .end(function (error, res) {

        if (error) exit(error);

        var allKeys = Object.keys(res.body);
        for (var i = 0; i < allKeys.length; i++) {
            if (keyName === allKeys[i]) exit(null, res.body[keyName].key);
        }

        exit(new Error('key not found'));
    });
}

switch (process.argv[2]) {
case 'get_ssh_key_id':
    getSshKeyId(process.argv[3]);
    break;

case 'create':

case 'get_id':

case 'get_ip':

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
