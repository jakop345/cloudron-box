'use strict';

var userdb = require('./userdb.js'),
    tokendb = require('./tokendb.js'),
    clientdb = require('./clientdb.js'),
    authcodedb = require('./authcodedb.js'),
    appdb = require('./appdb.js'),
    sqlite3 = require('sqlite3'),
    fs = require('fs'),
    path = require('path'),
    debug = require('debug')('database'),
    DatabaseError = require('./databaseerror');

exports = module.exports = {
    initialize: initialize
};

function initialize(config, callback) {
    var schema = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString('utf8');

    var db = new sqlite3.Database(config.configRoot + '/config.sqlite.db');
    debug('Database created at ' + config.configRoot + '/config.sqlite.db');

    db.exec(schema, function (err) {
        if (err) return callback(err);

        userdb.init(config.configRoot);
        tokendb.init(db);
        clientdb.init(db);
        authcodedb.init(db),
        appdb.init(db),

        // TODO this should happen somewhere else..no clue where - Johannes
        clientdb.del('cid-webadmin', function () {
            clientdb.add('cid-webadmin', 'cid-webadmin', 'unused', 'WebAdmin', 'https://localhost', function (error) {
                if (error && error.reason !== DatabaseError.ALREADY_EXISTS) return callback(new Error('Error initializing client database with webadmin'));
                return callback(null);
            });
        });
    });
}

