#!/usr/bin/env node

var AWS = require('aws-sdk'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance');

function die(msg) {
    console.error(msg);
    process.exit(1);
}

function publish(versionsFileName) {
    // check if the json is valid
    var versionsJson = safe.JSON.parse(fs.readFileSync(versionsFileName));
    if (!versionsJson) {
        die(versionsFileName + ' is not valid json : ' + safe.error);
    }

    // check all the keys
    var sortedVersions = Object.keys(versionsJson).sort();
    sortedVersions.forEach(function (version, index) {
        if (typeof versionsJson[version].imageId !== 'number') die('version ' + version + ' does not have proper imageId');
        if (versionsJson[version].next !== null && typeof versionsJson[version].next !== 'string') die('version ' + version + ' does not have proper next');
        if (typeof versionsJson[version].revision !== 'string') die('version ' + version + ' does not have proper revision');

        var nextVersion = versionsJson[version].next;
        if (nextVersion <= version) die('next version cannot be less than current @' + version);
    });

    // check that package.json version is in versions.json
    var currentVersion = require('../package.json').version;
    if (sortedVersions.indexOf(currentVersion) === -1) {
        die('package.json version is not present in versions.json');
    }

    if (sortedVersions.indexOf(currentVersion) !== sortedVersions.length - 1) {
        die('package.json version is not the latest version in ' + versionsFileName);
    }

    var config = {
        accessKeyId: 'AKIAJ3GNZ2C7W5XKAH7Q',
        secretAccessKey: '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'
    };

    var s3 = new AWS.S3(config);

    var versionsFileStream = fs.createReadStream(versionsFileName);

    var params = {
        Bucket: 'cloudron-releases',
        Key: path.basename(versionsFileName),
        ACL: 'public-read',
        Body: versionsFileStream,
        ContentType: 'application/json'
    };

    console.log('Uploading ' + path.basename(versionsFileName));
    s3.putObject(params, function (error, data) {
        if (error) return console.error(error);

        console.log(data);
    });
}

if (process.argv.length === 3) {
    publish(path.join(__dirname, 'versions-' + process.argv[2] + '.json'));
} else {
    console.log('publish.sh <dev|stable>');
}



