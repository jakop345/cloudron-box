'use strict';

var userdb = require('./userdb.js'),
    tokendb = require('./tokendb.js'),
    clientdb = require('./clientdb.js'),
    authcodedb = require('./authcodedb.js'),
    appdb = require('./appdb.js'),

exports = module.exports = {
    initialize: initialize
};

function initialize(config, callback) {
    userdb.init(config.configRoot);
    tokendb.init(config.configRoot);
    clientdb.init(config.configRoot);
    authcodedb.init(config.configRoot),
    appdb.init(config.configRoot),

    // TODO this should happen somewhere else..no clue where - Johannes
    clientdb.del('cid-webadmin', function () {
        clientdb.add('cid-webadmin', 'cid-webadmin', 'unused', 'WebAdmin', 'https://localhost', function (error) {
            if (error && error.reason !== DatabaseError.ALREADY_EXISTS) return callback(new Error('Error initializing client database with webadmin'));
            return callback(null);
        });
    });
}

