#!/usr/bin/env node

'use strict';

var fs = require('fs'),
    safe = require('safetydance'),
    semver = require('semver'),
    util = require('util'),
    url = require('url');

exports = module.exports = {
    verifyFile: verifyFile,
    verify: verify
};

function verify(versionsJson) {
    if (!versionsJson || typeof versionsJson !== 'object') return new Error('versions must be valid object');

    // check all the keys
    var sortedVersions = Object.keys(versionsJson).sort(semver.compare);
    for (var i = 0; i < sortedVersions.length; i++) {
        var version = sortedVersions[i];
        if (typeof versionsJson[version].imageId !== 'number') return new Error('version ' + version + ' does not have proper imageId');

        if (typeof versionsJson[version].imageName !== 'string' || !versionsJson[version].imageName.length) return new Error('version ' + version + ' does not have proper imageName');

        if ('changeLog' in versionsJson[version] && !util.isArray(versionsJson[version].changeLog)) return new Error('version ' + version + ' does not have proper changeLog');

        if (typeof versionsJson[version].date !== 'string' || ((new Date(versionsJson[version].date)).toString() === 'Invalid Date')) return new Error('invalid date or missing date');

        if (versionsJson[version].next !== null && typeof versionsJson[version].next !== 'string') return new Error('version ' + version + ' does not have proper next');

        if (typeof versionsJson[version].sourceTarballUrl !== 'string') return new Error('version ' + version + ' does not have proper sourceTarballUrl');

        if ('author' in versionsJson[version] && typeof versionsJson[version].author !== 'string') return new Error('author must be a string');

        var tarballUrl = url.parse(versionsJson[version].sourceTarballUrl);
        if (tarballUrl.protocol !== 'https:') return new Error('sourceTarballUrl must be https');
        if (!/.tar.gz$/.test(tarballUrl.path)) return new Error('sourceTarballUrl must be tar.gz');

        var nextVersion = versionsJson[version].next;
        // despite having the 'next' field, the appstore code currently relies on all versions being sorted based on semver.compare (see boxversions.js)
        if (nextVersion && semver.gt(version, nextVersion)) return new Error('next version cannot be less than current @' + version);
    }

    // check that package.json version is in versions.json
    var currentVersion = require('../package.json').version;
    if (sortedVersions.indexOf(currentVersion) === -1) {
        return new Error('package.json version is not present in versions.json');
    }

    return null;
}

function verifyFile(versionsFileName) {
    // check if the json is valid
    var versions = safe.JSON.parse(fs.readFileSync(versionsFileName));
    if (!versions) {
        return new Error(versionsFileName + ' is not valid json : ' + safe.error);
    }

    return verify(versions);
}


