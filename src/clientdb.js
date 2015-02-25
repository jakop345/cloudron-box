/* jslint node:true */

'use strict';

var assert = require('assert'),
    appdb = require('./appdb.js'),
    config = require('../config.js'),
    constants = require('../constants.js'),
    async = require('async'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:clientdb');

exports = module.exports = {
    get: get,
    getAll: getAll,
    getAllWithDetails: getAllWithDetails,
    add: add,
    del: del,
    getByAppId: getByAppId,
    delByAppId: delByAppId,

    _clear: clear
};

var CLIENTS_FIELDS = [ 'id', 'appId', 'clientSecret', 'redirectURI', 'scope' ].join(',');
var CLIENTS_FIELDS_PREFIXED = [ 'clients.id', 'clients.appId', 'clients.clientSecret', 'clients.redirectURI', 'clients.scope' ].join(',');

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    database.query('SELECT ' + CLIENTS_FIELDS + ' FROM clients ORDER BY appId', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function getAllWithDetails(callback) {
    assert(typeof callback === 'function');

    // TODO should this be per user?
    database.query('SELECT ' + CLIENTS_FIELDS_PREFIXED + ',COUNT(tokens.clientId) AS tokenCount FROM clients LEFT OUTER JOIN tokens ON clients.id=tokens.clientId GROUP BY clients.id', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        // We have three types of records here
        //   1) webadmin has an app id of 'webadmin'
        //   2) oauth proxy records are always the app id prefixed with 'proxy-'
        //   3) addon oauth records for apps prefixed with 'addon-'

        async.each(results, function (record, callback) {
            if (record.appId === constants.ADMIN_CLIENT_ID) {
                record.name = 'Webadmin';
                record.location = constants.ADMIN_LOCATION;
                return callback(null, record);
            }

            var appId = record.appId.indexOf('proxy-') === 0 ? record.appId.slice('proxy-'.length) : record.appId;
            appdb.get(appId, function (error, result) {
                if (error) return callback(error);

                record.name = result.manifest.title + (record.appId.indexOf('proxy-') === 0 ? 'OAuth Proxy' : '');
                record.location = result.location;

                callback(null, record);
            });
        }, callback);
    });
}

function getByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE appId = ? LIMIT 1', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null, result[0]);
    });
}

function add(id, appId, clientSecret, redirectURI, scope, callback) {
    assert(typeof id === 'string');
    assert(typeof appId === 'string');
    assert(typeof clientSecret === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof scope === 'string');
    assert(typeof callback === 'function');

    var data = [ id, appId, clientSecret, redirectURI, scope ];

    database.query('INSERT INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (?, ?, ?, ?, ?)', data, function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || result.affectedRows === 0) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function delByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM clients WHERE appId=?', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    database.query('DELETE FROM clients WHERE appId!="webadmin"', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

