/* jslint node:true */

'use strict';

exports = module.exports = {
    AWSError: AWSError,

    getAWSCredentials: getAWSCredentials
};

var assert = require('assert'),
    config = require('./config.js'),
    debug = require('debug')('box:aws'),
    superagent = require('superagent'),
    util = require('util');

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AWSError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(AWSError, Error);
AWSError.INTERNAL_ERROR = 'Internal Error';
AWSError.MISSING_CREDENTIALS = 'Missing AWS credentials';

function getAWSCredentials(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('getAWSCredentials()');

    // CaaS
    if (config.token()) {
        var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/awscredentials';
        superagent.get(url).query({ token: config.token() }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 200) return callback(new Error(result.text));
            if (!result.body) return callback(new Error('Unexpected response'));

            debug('getAWSCredentials()', result.body);

            return callback(null, result.body.credentials);
        });
    } else {
        // return credentials from config.js
        callback(new AWSError(AWSError.MISSING_CREDENTIALS));
    }
}


