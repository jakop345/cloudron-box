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

    gServer.search('ou=users,dc=cloudron', function (req, res, next) {
        debug('ldap user search: dn %s, scope %s, filter %s', req.dn.toString(), req.scope, req.filter.toString());

        user.list(function (error, result){
            if (error) return next(new ldap.OperationsError(error.toString()));

            // send user objects
            result.forEach(function (entry) {
                var dn = ldap.parseDN('cn=' + entry.id + ',ou=users,dc=cloudron');

                var tmp = {
                    dn: dn.toString(),
                    attributes: {
                        objectclass: ['user'],
                        cn: entry.id,
                        uid: entry.id,
                        mail: entry.email,
                        displayname: entry.username,
                        username: entry.username
                    }
                };

                if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && req.filter.matches(tmp.attributes)) {
                    res.send(tmp);
                    debug('ldap user send:', tmp);
                }
            });

            debug('');
            res.end();
        });
    });

    gServer.search('ou=groups,dc=cloudron', function (req, res, next) {
        debug('ldap group search: dn %s, scope %s, filter %s', req.dn.toString(), req.scope, req.filter.toString());

        user.list(function (error, result){
            if (error) return next(new ldap.OperationsError(error.toString()));

            // we only have an admin group
            var dn = ldap.parseDN('cn=admin,ou=groups,dc=cloudron');

            var tmp = {
                dn: dn.toString(),
                attributes: {
                    objectclass: ['group'],
                    cn: 'admin',
                    memberuid: result.filter(function (entry) { return entry.admin; }).map(function(entry) { return entry.id; })
                }
            };

            if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && req.filter.matches(tmp.attributes)) {
                res.send(tmp);
                debug('ldap group send:', tmp);
            }

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
