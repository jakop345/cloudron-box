'use strict';

var assert = require('assert'),
    util = require('util');

module.exports = HttpSuccess;

function HttpSuccess(statusCode, body) {
    assert(typeof body === 'object' && !util.isArray(body), 'We must always send objects in the response body');

    this.statusCode = statusCode;
    this.body = body;
}
