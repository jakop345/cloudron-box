dbm = dbm || require('db-migrate');
var safe = require('safetydance');
var type = dbm.dataType;

exports.up = function(db, callback) {
    var tz = safe.fs.readFileSync('/etc/timezone', 'utf8');
    tz = tz ? tz.trim() : 'America/Los_Angeles';

    db.runSql('INSERT settings (name, value) VALUES("time_zone", ?)', [ tz ], callback);
};

exports.down = function(db, callback) {
    db.runSql('DELETE * FROM settings WHERE name="time_zone"', [ ], callback);
};

