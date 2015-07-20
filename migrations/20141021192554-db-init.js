var dbm = require('db-migrate');
var type = dbm.dataType;

var fs = require('fs'),
    async = require('async'),
    path = require('path');

exports.up = function(db, callback) {
    var schema = fs.readFileSync(path.join(__dirname, 'initial-schema.sql')).toString('utf8');
    var statements = schema.split(';');
    async.eachSeries(statements, function (statement, callback) {
        if (statement.trim().length === 0) return callback(null);
        db.runSql(statement, callback);
    }, callback);
};

exports.down = function(db, callback) {
    db.runSql('DROP TABLE users, tokens, clients, apps, appPortBindings, authcodes, settings', callback);
};
