var dbm = require('db-migrate');
var type = dbm.dataType;

var async = require('async');

exports.up = function(db, callback) {
    // All that work only because SQLite does not support removing columns...
    db.runSql('ALTER TABLE clients RENAME TO clients_old', function (error) {
        if (error) return callback(error);

        db.runSql('CREATE TABLE clients(' +
            'id VARCHAR(512) NOT NULL UNIQUE,' +
            'appId VARCHAR(512) NOT NULL,' +
            'clientSecret VARCHAR(512) NOT NULL,' +
            'redirectURI VARCHAR(512) NOT NULL,' +
            'scope VARCHAR(512) NOT NULL,' +
            'PRIMARY KEY(id));');

        db.all('SELECT * FROM clients_old;', function (error, result) {
            if (error) return callback(error);

            async.eachSeries(result, function (record, callback) {
                if (record.clientId === 'cid-webadmin') db.runSql('INSERT INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (?, ?, ?, ?, ?)', record.clientId, record.appId, record.clientSecret, record.redirectURI, record.scope, callback);
                else db.runSql('INSERT INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (?, ?, ?, ?, ?)', record.id, record.appId, record.clientSecret, record.redirectURI, record.scope, callback);
            }, function (error) {
                if (error) return callback(error);

                db.runSql('DROP TABLE clients_old', callback);
            });
        });
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE clients ADD clientId VARCHAR(512)', function (error) {
        if (error) return callback(error);
        db.runSql('ALTER TABLE clients ADD name VARCHAR(512)', callback);
    });
};
