'use strict';

var assert = require('assert'),
    config = require('../config.js'),
    debug = require('debug')('box:ldap'),
    user = require('./user.js'),
    UserError = user.UserError,
    ldap = require('ldapjs');

var gServer = null;

exports = module.exports = {
    start: start
};

function start(callback) {
    assert(typeof callback === 'function');

    gServer = ldap.createServer();

    gServer.search('dc=cloudron', function (req, res, next) {
        debug('ldap search: dn %s, scope %s, filter %s', req.dn.toString(), req.scope, req.filter.toString());

        user.list(function (error, result){
            if (error) return next(new ldap.OperationsError(error.toString()));

            result.forEach(function (entry) {
                var tmp = {
                    dn: 'dn=' + entry.id + ',dc=cloudron',
                    attributes: {
                        objectclass: ['user'],
                        uid: entry.id,
                        mail: entry.email,
                        displayname: entry.username,
                        username: entry.username
                    }
                };

                if (req.filter.matches(tmp.attributes)) {
                    res.send(tmp);
                    debug('ldap send:', tmp);
                }
            });

            debug('');
            res.end();
        });
    });

    gServer.bind('dc=cloudron', function(req, res, next) {
        debug('ldap bind: %s', req.dn.toString());

        debug(req.dn, req.dn.rdns[0].dn);

        user.verify(req.dn.rdns[0].dn, req.credentials, function (error, result) {
            if (error && error.reason === UserError.NOT_FOUND) return next(new ldap.NoSuchObjectError(req.dn.toString()));
            if (error && error.reason === UserError.WRONG_PASSWORD) return next(new ldap.InvalidCredentialsError(req.dn.toString()));
            if (error) return next(new ldap.OperationsError(error));

            res.end();
        });
    });

    gServer.listen(config.get('ldapPort'), callback);
}
