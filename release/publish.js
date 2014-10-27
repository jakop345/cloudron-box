#!/usr/bin/env node

var AWS = require('aws-sdk'),
    fs = require('fs'),
    path = require('path');

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

s3.putObject(params, function (error, data) {
    if (error) return console.error(error);

    console.log(data);
});

