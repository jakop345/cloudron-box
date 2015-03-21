'use strict';

var assert = require('assert'),
    packageNameRe = require('java-packagename-regex'),
    safe = require('safetydance'),
    semver = require('semver'),
    tv4 = require('tv4').freshApi(),
    util = require('util'),
    validator = require('validator');

var manifestSchema = {
    type: 'object',
    properties: {
        'id': {
            type: 'string',
            format: 'reverseDomain'
        },
        'manifestVersion': {
            type: 'integer',
            minimum: 1,
            maximum: 1
        },
        'version': {
            type: 'string',
            format: 'semver'
        },
        'dockerImage': {
            type: 'string',
            minLength: 1
        },
        'healthCheckPath': {
            type: 'string',
            minLength: 1
        },
        'httpPort': {
            type: 'integer',
            minimum: 1,
            maximum: 65535
        },
        'title': {
            type: 'string',
            minLength: 5
        },
        'description': {
            type: 'string',
            minLength: 5
        },
        'tagline': {
            type: 'string',
            minLength: 5
        },
        'website': {
            type: 'string',
            format: 'uri'
        },
        'contactEmail': {
            type: 'string',
            format: 'email'
        },
        'targetBoxVersion': {
            type: 'string',
            format: 'semver'
        },
        'minBoxVersion': {
            type: 'string',
            format: 'semver'
        },
        'maxBoxVersion': {
            type: 'string',
            format: 'semver'
        },
        'addons': {
            type: 'array',
            items: {
                type: 'string',
                enum: [ 'redis', 'sendmail', 'oauth', 'mysql', 'postgresql' ]
            },
            minItems: 1,
            uniqueItems: true
        },
        'tcpPorts': {
            type: 'object',
            minProperties: 1,
            patternProperties: {
                '^[a-zA-Z0-9_]+$': {
                    type: 'object',
                    properties: {
                        'title': {
                            type: 'string',
                            minLength: 5
                        },
                        'description': {
                            type: 'string',
                            minLength: 5
                        },
                        'containerPort': {
                            type: 'integer',
                            minimum: 1,
                            maximum: 65535
                        },
                        'defaultValue': {
                            type: 'integer',
                            minimum: 1024,
                            maximum: 65535
                        }
                    },
                    required: [ 'title', 'description' ]
                }
            }
        }
    },
    required: [ 'id', 'manifestVersion', 'version', 'dockerImage', 'healthCheckPath', 'httpPort', 'title', 'description', 'tagline', 'website', 'contactEmail' ]
};

exports = module.exports = {
    parse: parse,

    SCHEMA: manifestSchema
};

tv4.addFormat('semver', function (data, schema) {
    return semver.valid(data) ? null : 'not a semver';
});

tv4.addFormat('uri', function (data, schema) {
    var options = {
        protocols: [ 'http', 'https' ],
        require_tld: true,
        require_protocol: false,
        allow_underscores: false,
        host_whitelist: false,
        host_blacklist: false
    };

    if (!validator.isURL(data, options)) return 'Invalid URL';

    return null;
});

tv4.addFormat('reverseDomain', function (data, schema) {
    return packageNameRe().test(data) ? null : 'Invalid id';
});

tv4.addFormat('email', function (data, schema) {
    return validator.isEmail(data) ? null : 'Invalid email';
});

// NOTE: keep this in sync with the code in apptask.js in box
function parse(manifestJson) {
    assert(typeof manifestJson === 'string');

    function error(msg) {
        return { error: new Error(msg), manifest: null };
    }

    var manifest = safe.JSON.parse(manifestJson);

    if (manifest === null) return error('Unable to parse manifest: ' + safe.error.message);

    var result = tv4.validateResult(manifest, manifestSchema, false /* recursive */, true /* banUnknownProperties */);
    if (!result.valid) return error(result.error.message + (result.error.dataPath ? ' @ ' + result.error.dataPath : ''));

    return { manifest: manifest, error: null };
}

