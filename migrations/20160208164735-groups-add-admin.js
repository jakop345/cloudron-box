'use strict';

var dbm = global.dbm || require('db-migrate');
var async = require('async');

var ADMIN_GROUP_ID = 'admin'; // see groups.js

exports.up = function(db, callback) {
	async.series([
		db.runSql.bind(db, 'START TRANSACTION;'),
		db.runSql.bind(db, 'INSERT INTO groups (id, name) VALUES (?, ?)', [ ADMIN_GROUP_ID, 'admin' ]),
		function migrateAdminFlag(done) {
			db.all('SELECT * FROM users WHERE admin=1', function (error, results) {
				if (error) return done(error);

				console.dir(results);

				async.eachSeries(results, function (r, next) {
					db.runSql('INSERT INTO groupMembers (groupId, userId) VALUES (?, ?)', [ ADMIN_GROUP_ID, r.id ], next);
				}, done);
			});
		},
		db.runSql.bind(db, 'ALTER TABLE users DROP COLUMN admin'),
		db.runSql.bind(db, 'COMMIT')
	], callback);
};

exports.down = function(db, callback) {
    callback();
};
