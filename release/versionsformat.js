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
        var versionInfo = versionsJson[version];

        if (typeof versionInfo.imageId !== 'number') return new Error('version ' + version + ' does not have proper imageId');

        if (typeof versionInfo.imageName !== 'string' || !versionInfo.imageName.length) return new Error('version ' + version + ' does not have proper imageName');

        if ('changeLog' in versionsJson[version] && !util.isArray(versionInfo.changeLog)) return new Error('version ' + version + ' does not have proper changeLog');

        if (typeof versionInfo.date !== 'string' || ((new Date(versionInfo.date)).toString() === 'Invalid Date')) return new Error('invalid date or missing date');

        if (versionInfo.next !== null) {
            if (typeof versionInfo.next !== 'string') return new Error('version ' + version + ' does not have "string" next');
            if (!semver.valid(versionInfo.next)) return new Error('version ' + version + ' has non-semver next');
            if (!(versionInfo.next in versionsJson)) return new Error('version ' + version + ' points to non-existent version');
        }

        if (typeof versionInfo.sourceTarballUrl !== 'string') return new Error('version ' + version + ' does not have proper sourceTarballUrl');

        if ('author' in versionsJson[version] && typeof versionInfo.author !== 'string') return new Error('author must be a string');

        var tarballUrl = url.parse(versionInfo.sourceTarballUrl);
        if (tarballUrl.protocol !== 'https:') return new Error('sourceTarballUrl must be https');
        if (!/.tar.gz$/.test(tarballUrl.path)) return new Error('sourceTarballUrl must be tar.gz');

        var nextVersion = versionInfo.next;
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


