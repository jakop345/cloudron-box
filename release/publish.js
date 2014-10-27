#!/usr/bin/env node

var AWS = require('aws-sdk'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance');

function die(msg) {
    console.error(msg);
    process.exit(1);
}

// check if the json is valid
var versionsJson = safe.JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json')));
if (!versionsJson) {
    die('versions.json is not valid json : ' + safe.error);
}

// check all the keys
Object.keys(versionsJson).forEach(function (version) {
    if (!versionsJson[version].imageId) die('version ' + version + ' does not have imageId');
    if (!('next' in versionsJson[version])) die('version ' + version + ' does not have next');
    if (!versionsJson[version].revision) die('version ' + version + ' does not have revision');
});

var config = {
    accessKeyId: 'AKIAJ3GNZ2C7W5XKAH7Q',
    secretAccessKey: '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'
};

var s3 = new AWS.S3(config);

var versionsFileStream = fs.createReadStream(path.join(__dirname, 'versions.json'));

var params = {
    Bucket: 'cloudron-releases',
    Key: 'versions.json',
    ACL: 'public-read',
    Body: versionsFileStream,
    Metadata: {
        'Content-Type': 'application/json'
    }
};

console.log('Uploading versions.json');
s3.putObject(params, function (error, data) {
    if (error) return console.error(error);

    console.log(data);
});

