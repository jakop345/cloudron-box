/* jslint node:true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    appdb = require('./appdb.js'),
    config = require('../config.js'),
    async = require('async'),
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
    clear: clear
};

var CLIENTS_FIELDS = [ 'id', 'appId', 'clientSecret', 'redirectURI', 'scope' ].join(',');
var CLIENTS_FIELDS_PREFIXED = [ 'clients.id', 'clients.appId', 'clients.clientSecret', 'clients.redirectURI', 'clients.scope' ].join(',');

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    database.all('SELECT ' + CLIENTS_FIELDS + ' FROM clients', [ ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        callback(null, results);
    });
}

function getAllWithDetails(callback) {
    assert(typeof callback === 'function');

    // TODO should this be per user?
    database.all('SELECT ' + CLIENTS_FIELDS_PREFIXED + ',COUNT(tokens.clientId) AS tokenCount FROM clients LEFT OUTER JOIN tokens ON clients.id=tokens.clientId GROUP BY clients.id', [], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        // We have three types of records here
        //   1) webadmin has an app id of 'webadmin'
        //   2) oauth proxy records are always the app id prefixed with 'proxy-'
        //   3) normal oauth records for apps

        var tmp = [];
        async.each(results, function (record, callback) {
            if (record.appId === 'webadmin') {
                record.name = 'Webadmin';
                record.location = 'admin';
                tmp.push(record);
                return callback(null);
            }

            var appId = record.appId.indexOf('proxy-') === 0 ? record.appId.slice('proxy-'.length) : record.appId;
            appdb.get(appId, function (error, result) {
                if (error) return callback(error);

                record.name = result.manifest.title + (record.appId.indexOf('proxy-') === 0 ? 'OAuth Proxy' : '');
                record.location = result.location;

                tmp.push(record);

                callback(null);
            });
        }, function (error) {
            if (error) return callback(error);
            console.log('----',tmp)
            callback(null, tmp);
        });
    });
}

function getByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE appId = ? LIMIT 1', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null, result);
    });
}

function add(id, appId, clientSecret, redirectURI, scope, callback) {
    assert(typeof id === 'string');
    assert(typeof appId === 'string');
    assert(typeof clientSecret === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof scope === 'string');
    assert(typeof callback === 'function');

    var data = {
        $id: id,
        $appId: appId,
        $clientSecret: clientSecret,
        $redirectURI: redirectURI,
        $scope: scope
    };

    database.run('INSERT INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES ($id, $appId, $clientSecret, $redirectURI, $scope)', data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM clients WHERE id = ?', [ id ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function delByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM clients WHERE appId=?', [ appId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    database.run('DELETE FROM clients WHERE appId!="webadmin"', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

