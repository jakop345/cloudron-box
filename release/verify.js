#!/usr/bin/env node

var AWS = require('aws-sdk'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance'),
    semver = require('semver');

function die(msg) {
    console.error(msg);
    process.exit(1);
}

function verify(versionsFileName) {
    // check if the json is valid
    var versionsJson = safe.JSON.parse(fs.readFileSync(versionsFileName));
    if (!versionsJson) {
        die(versionsFileName + ' is not valid json : ' + safe.error);
    }

    // check all the keys
    var sortedVersions = Object.keys(versionsJson).sort();
    sortedVersions.forEach(function (version, index) {
        if (typeof versionsJson[version].imageId !== 'number') die('version ' + version + ' does not have proper imageId');
        if (typeof versionsJson[version].imageName !== 'string' || !versionsJson[version].imageName.length) die('version ' + version + ' does not have proper imageName');
        if ('changeLog' in versionsJson[version] && !util.isArray(versionsJson[version].changeLog)) die('version ' + version + ' does not have proper changeLog');
        if (versionsJson[version].next !== null && typeof versionsJson[version].next !== 'string') die('version ' + version + ' does not have proper next');
        if (typeof versionsJson[version].sourceTarballUrl !== 'string') die('version ' + version + ' does not have proper sourceTarballUrl');

        var nextVersion = versionsJson[version].next;
        // despite having the 'next' field, the appstore code currently relies on all versions being sorted based on semver.compare (see boxversions.js)
        if (nextVersion && semver.gt(version, nextVersion)) die('next version cannot be less than current @' + version);
    });

    // check that package.json version is in versions.json
    var currentVersion = require('../package.json').version;
    if (sortedVersions.indexOf(currentVersion) === -1) {
        die('package.json version is not present in versions.json');
    }
}

if (process.argv.length === 3) {
    verify(process.argv[2]);
    process.exit(0);
} else {
    console.log('verify.js <versions_file>');
}



