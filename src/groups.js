/* jshint node:true */

'use strict';

exports = module.exports = {
    GroupError: GroupError,

    create: create,
    remove: remove,
    get: get,
    getWithMembers: getWithMembers,
    getAll: getAll,

    getMembers: getMembers,
    addMember: addMember,
    removeMember: removeMember,
    isMember: isMember,

    getGroups: getGroups,
    setGroups: setGroups,

    ADMIN_GROUP_ID: 'admin' // see db migration code and groupdb._clear
};

var assert = require('assert'),
    DatabaseError = require('./databaseerror.js'),
    groupdb = require('./groupdb.js'),
    util = require('util');

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function GroupError(reason, errorOrMessage) {
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
util.inherits(GroupError, Error);
GroupError.INTERNAL_ERROR = 'Internal Error';
GroupError.ALREADY_EXISTS = 'Already Exists';
GroupError.NOT_FOUND = 'Not Found';
GroupError.BAD_NAME = 'Bad name';
GroupError.NOT_EMPTY = 'Not Empty';

function validateGroupname(name) {
    assert.strictEqual(typeof name, 'string');
    var RESERVED = [ 'admins', 'users' ]; // ldap code uses 'users' pseudo group

    if (name.length <= 2) return new GroupError(GroupError.BAD_NAME, 'name must be atleast 3 chars');
    if (name.length >= 200) return new GroupError(GroupError.BAD_NAME, 'name too long');

    if (!/^[A-Za-z0-9_-]*$/.test(name)) return new GroupError(GroupError.BAD_NAME, 'name can only have A-Za-z0-9_-');

    if (RESERVED.indexOf(name) !== -1) return new GroupError(GroupError.BAD_NAME, 'name is reserved');

    return null;
}

function create(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateGroupname(name);
    if (error) return callback(error);

    groupdb.add(name /* id */, name, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new GroupError(GroupError.ALREADY_EXISTS));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        callback(null, { id: name, name: name });
    });
}

function remove(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.del(id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error && error.reason === DatabaseError.IN_USE) return callback(new GroupError(GroupError.NOT_EMPTY));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.get(id, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function getWithMembers(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.getWithMembers(id, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    groupdb.getAll(function (error, result) {
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function getMembers(groupId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.getMembers(groupId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function getGroups(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.getGroups(userId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function setGroups(userId, groupIds, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert(Array.isArray(groupIds));
    assert.strictEqual(typeof callback, 'function');

    groupdb.setGroups(userId, groupIds, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function addMember(groupId, userId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.addMember(groupId, userId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function removeMember(groupId, userId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.removeMember(groupId, userId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function isMember(groupId, userId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.isMember(groupId, userId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}
