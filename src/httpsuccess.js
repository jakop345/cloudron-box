'use strict';

var assert = require('assert'),
    util = require('util');

module.exports = HttpSuccess;

function HttpSuccess(statusCode, body) {
    assert(typeof body === 'undefined' || (typeof body === 'object' && !util.isArray(body), 'Body must be a non-array object'));

    this.status = statusCode;
    if (body) this.body = body;
}
