'use strict';

exports = module.exports = {
    start: start,
    stop: stop
};

var assert = require('assert'),
    apps = require('./apps.js'),
    config = require('./config.js'),
    debug = require('debug')('box:ldap'),
    eventlog = require('./eventlog.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    ldap = require('ldapjs');

var gServer = null;

var NOOP = function () {};

var gLogger = {
    trace: NOOP,
    debug: NOOP,
    info: debug,
    warn: debug,
    error: console.error,
    fatal: console.error
};

var GROUP_USERS_DN = 'cn=users,ou=groups,dc=cloudron';
var GROUP_ADMINS_DN = 'cn=admins,ou=groups,dc=cloudron';

function getAppByRequest(req, callback) {
    var sourceIp = req.connection.ldap.id.split(':')[0];
    if (sourceIp.split('.').length !== 4) return callback(new ldap.InsufficientAccessRightsError('Missing source identifier'));

    apps.getByIpAddress(sourceIp, function (error, app) {
        // we currently allow access in case we can't find the source app
        callback(null, app || null);
    });
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    gServer = ldap.createServer({ log: gLogger });

    gServer.search('ou=users,dc=cloudron', function (req, res, next) {
        debug('user search: dn %s, scope %s, filter %s', req.dn.toString(), req.scope, req.filter.toString());

        user.list(function (error, result) {
            if (error) return next(new ldap.OperationsError(error.toString()));

            // send user objects
            result.forEach(function (entry) {
                var dn = ldap.parseDN('cn=' + entry.id + ',ou=users,dc=cloudron');

                var groups = [ GROUP_USERS_DN ];
                if (entry.admin) groups.push(GROUP_ADMINS_DN);

                var displayName = entry.displayName || entry.username;
                var nameParts = displayName.split(' ');
                var firstName = nameParts[0];
                var lastName = nameParts.length > 1  ? nameParts[nameParts.length - 1] : ''; // choose last part, if it exists

                var obj = {
                    dn: dn.toString(),
                    attributes: {
                        objectclass: ['user'],
                        objectcategory: 'person',
                        cn: entry.id,
                        uid: entry.id,
                        mail: entry.email,
                        displayname: displayName,
                        givenName: firstName,
                        username: entry.username,
                        samaccountname: entry.username,      // to support ActiveDirectory clients
                        memberof: groups
                    }
                };

                // http://www.zytrax.com/books/ldap/ape/core-schema.html#sn has 'name' as SUP which is a DirectoryString
                // which is required to have atleast one character if present
                if (lastName.length !== 0) obj.attributes.sn = lastName;

                // ensure all filter values are also lowercase
                var lowerCaseFilter = ldap.parseFilter(req.filter.toString().toLowerCase());

                if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                    res.send(obj);
                }
            });

            res.end();
        });
    });

    gServer.search('ou=groups,dc=cloudron', function (req, res, next) {
        debug('group search: dn %s, scope %s, filter %s', req.dn.toString(), req.scope, req.filter.toString());

        user.list(function (error, result){
            if (error) return next(new ldap.OperationsError(error.toString()));

            var groups = [{
                name: 'users',
                admin: false
            }, {
                name: 'admins',
                admin: true
            }];

            groups.forEach(function (group) {
                var dn = ldap.parseDN('cn=' + group.name + ',ou=groups,dc=cloudron');
                var members = group.admin ? result.filter(function (entry) { return entry.admin; }) : result;

                var obj = {
                    dn: dn.toString(),
                    attributes: {
                        objectclass: ['group'],
                        cn: group.name,
                        memberuid: members.map(function(entry) { return entry.id; })
                    }
                };

                // ensure all filter values are also lowercase
                var lowerCaseFilter = ldap.parseFilter(req.filter.toString().toLowerCase());

                if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                    res.send(obj);
                }
            });

            res.end();
        });
    });

    // this is the bind for the mail addon to authorize apps
    gServer.bind('ou=sendmail,dc=cloudron', function(req, res, next) {
        // TODO: validate password
        debug('sendmail bind: %s', req.dn.toString()); // note: cn can be email or id
        res.end();
    });

    // this is the bind for the mail addon to authorize apps
    gServer.bind('ou=recvmail,dc=cloudron', function(req, res, next) {
        // TODO: validate password
        debug('recvmail bind: %s', req.dn.toString()); // note: cn can be email or id
        res.end();
    });

    gServer.bind('ou=apps,dc=cloudron', function(req, res, next) {
        // TODO: validate password
        debug('application bind: %s', req.dn.toString());
        res.end();
    });

    gServer.bind('ou=users,dc=cloudron', function(req, res, next) {
        debug('user bind: %s', req.dn.toString());

        // extract the common name which might have different attribute names
        var attributeName = Object.keys(req.dn.rdns[0])[0];
        var commonName = req.dn.rdns[0][attributeName];
        if (!commonName) return next(new ldap.NoSuchObjectError(req.dn.toString()));

        var api;
        // if mail is specified, enforce mail check
        if (commonName.indexOf('@') !== -1 || attributeName === 'mail') {
            api = user.verifyWithEmail;
        } else if (commonName.indexOf('uid-') === 0) {
            api = user.verify;
        } else {
            api = user.verifyWithUsername;
        }

        // TODO this should be done after we verified the app has access to avoid leakage of user existence
        api(commonName, req.credentials || '', function (error, userObject) {
            if (error && error.reason === UserError.NOT_FOUND) return next(new ldap.NoSuchObjectError(req.dn.toString()));
            if (error && error.reason === UserError.WRONG_PASSWORD) return next(new ldap.InvalidCredentialsError(req.dn.toString()));
            if (error) return next(new ldap.OperationsError(error));

            getAppByRequest(req, function (error, app) {
                if (error) return next(error);

                if (!app) {
                    debug('no app found for this container, allow access');
                    return res.end();
                }

                apps.hasAccessTo(app, userObject, function (error, result) {
                    if (error) return next(new ldap.OperationsError(error.toString()));

                    // we return no such object, to avoid leakage of a users existence
                    if (!result) return next(new ldap.NoSuchObjectError(req.dn.toString()));

                    eventlog.add(eventlog.ACTION_USER_LOGIN, { authType: 'ldap', appId: app.id }, { userId: userObject.id });

                    res.end();
                });
            });
        });
    });

    gServer.listen(config.get('ldapPort'), callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    gServer.close();

    callback();
}
