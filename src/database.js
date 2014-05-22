/* jslint node:true */

'use strict';

var userdb = require('./userdb.js'),
    tokendb = require('./tokendb.js'),
    clientdb = require('./clientdb.js'),
    authcodedb = require('./authcodedb.js'),
    appdb = require('./appdb.js'),
    sqlite3 = require('sqlite3'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    debug = require('debug')('server:database'),
    DatabaseError = require('./databaseerror');

exports = module.exports = {
    initialize: initialize,
    removePrivates: removePrivates
};

function initialize(config, callback) {
    var schema = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString('utf8');

    mkdirp(config.configRoot, function (error) {
        if (error) {
            debug('Unable to ensure the config root directory. ', error);
            return callback(error);
        }

        var db = new sqlite3.Database(config.configRoot + '/config.sqlite.db');
        debug('Database created at ' + config.configRoot + '/config.sqlite.db');

        db.exec(schema, function (err) {
            if (err) return callback(err);

            userdb.init(db);
            tokendb.init(db);
            clientdb.init(db);
            authcodedb.init(db);
            appdb.init(db);

            // TODO this should happen somewhere else..no clue where - Johannes
            clientdb.del('cid-webadmin', function () {
                clientdb.add('cid-webadmin', 'cid-webadmin', 'unused', 'WebAdmin', 'https://localhost', function (error) {
                    if (error && error.reason !== DatabaseError.ALREADY_EXISTS) return callback(new Error('Error initializing client database with webadmin'));
                    return callback(null);
                });
            });
        });
    });
}

function removePrivates(obj) {
    var res = { };

    for (var p in obj) {
        if (!obj.hasOwnProperty(p)) continue;
        if (p.substring(0, 1) === '_') continue;
        res[p] = obj[p]; // ## make deep copy?
    }

    return res;
}

