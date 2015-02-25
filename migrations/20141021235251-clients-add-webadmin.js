var dbm = require('db-migrate');
var type = dbm.dataType;

var uuid = require('node-uuid');

// TODO: remove this file and move it to a 'test' script
// migration scripts are are meant to add one time entries and schema changes and not for 'updated' values
// 'updated' values belong in setup script because migration scrips are only run once
exports.up = function(db, callback) {
    var scopes = 'root,profile,users,apps,settings,roleAdmin';
    var adminOrigin = 'https://admin-localhost';

    // postinstall.sh creates the webadmin entry in production mode
    if (process.env.NODE_ENV !== 'test') return callback(null);

    db.runSql('INSERT INTO clients (id, appId, clientSecret, redirectURI, scope) ' +
              'VALUES (?, ?, ?, ?, ?)', [ 'cid-' + uuid.v4(), 'webadmin', 'unused', adminOrigin, scopes ],
              callback);
};

exports.down = function(db, callback) {
    // not sure what is meaningful here
    callback(null);
};
