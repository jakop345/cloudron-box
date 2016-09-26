'use strict';

exports = module.exports = {
    start: start,
    stop: stop
};

var assert = require('assert'),
    apps = require('./apps.js'),
    config = require('./config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:ldap'),
    eventlog = require('./eventlog.js'),
    user = require('./user.js'),
    UserError = user.UserError,
    ldap = require('ldapjs'),
    mailboxdb = require('./mailboxdb.js'),
    safe = require('safetydance'),
    util = require('util');

var gServer = null;

var NOOP = function () {};

var GROUP_USERS_DN = 'cn=users,ou=groups,dc=cloudron';
var GROUP_ADMINS_DN = 'cn=admins,ou=groups,dc=cloudron';

function getAppByRequest(req, callback) {
    var sourceIp = req.connection.ldap.id.split(':')[0];
    if (sourceIp.split('.').length !== 4) return callback(new ldap.InsufficientAccessRightsError('Missing source identifier'));

    apps.getByIpAddress(sourceIp, function (error, app) {
        if (error) return callback(new ldap.OperationsError(error.message));

        if (!app) return callback(new ldap.OperationsError('Could not detect app source'));

        callback(null, app);
    });
}

function userSearch(req, res, next) {
    debug('user search: dn %s, scope %s, filter %s (from %s)', req.dn.toString(), req.scope, req.filter.toString(), req.connection.ldap.id);

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
                    // TODO: check mailboxes before we send this
                    mailAlternateAddress: entry.username + '@' + config.fqdn(),
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
            var lowerCaseFilter = safe(function () { return ldap.parseFilter(req.filter.toString().toLowerCase()); }, null);
            if (!lowerCaseFilter) return next(new ldap.OperationsError(safe.error.toString()));

            if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                res.send(obj);
            }
        });

        res.end();
    });
}

function groupSearch(req, res, next) {
    debug('group search: dn %s, scope %s, filter %s (from %s)', req.dn.toString(), req.scope, req.filter.toString(), req.connection.ldap.id);

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
            var lowerCaseFilter = safe(function () { return ldap.parseFilter(req.filter.toString().toLowerCase()); }, null);
            if (!lowerCaseFilter) return next(new ldap.OperationsError(safe.error.toString()));

            if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                res.send(obj);
            }
        });

        res.end();
    });
}

function getMailbox(req, res, next) {
    debug('mailbox get: dn %s, scope %s, filter %s (from %s)', req.dn.toString(), req.scope, req.filter.toString(), req.connection.ldap.id);

    // http://www.zytrax.com/books/ldap/ape/courier.html
    // http://www.ldapadmin.org/docs/postfix.schema
    // https://wiki.zimbra.com/wiki/5.0.15_Directory_Schema
    var get = !!req.dn.rdns[0].attrs.cn;
    var func = get ? mailboxdb.getMailbox.bind(null, req.dn.rdns[0].attrs.cn) : mailboxdb.getMailboxes;
    func(function (error, result) {
        if (error) return next(new ldap.OperationsError(error.toString()));

        var results = util.isArray(result) ? result : [ result ];

        results.forEach(function (mailbox) {
            var dn = ldap.parseDN('cn=' + mailbox.name + ',ou=mailboxes,dc=cloudron');

            var obj = {
                dn: req.dn.toString(),
                attributes: {
                    objectclass: ['mailbox'],
                    objectcategory: 'mailbox',
                    cn: name,
                    uid: mailbox.ownerId,
                    mail: name + '@' + config.fqdn()
                }
            };

            // ensure all filter values are also lowercase
            var lowerCaseFilter = safe(function () { return ldap.parseFilter(req.filter.toString().toLowerCase()); }, null);
            if (!lowerCaseFilter) return next(new ldap.OperationsError(safe.error.toString()));

            if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                res.send(obj);
            }
        });

        res.end();
    });
}

function getMailAlias(req, res, next) {
    debug('mail alias get: dn %s, scope %s, filter %s (from %s)', req.dn.toString(), req.scope, req.filter.toString(), req.connection.ldap.id);

    // https://wiki.debian.org/LDAP/MigrationTools/Examples
    var get = !!req.dn.rdns[0].attrs.cn;
    var func = get ? mailboxdb.getAlias.bind(null, req.dn.rdns[0].attrs.cn) : mailboxdb.getAliases;
    func(function (error, result) {
        if (error) return next(new ldap.OperationsError(error.toString()));

        var results = util.isArray(result) ? result : [ result ];

        results.forEach(function (alias) {
            var dn = ldap.parseDN('cn=' + alias.name + ',ou=mailaliases,dc=cloudron');

            var obj = {
                dn: dn.toString(),
                attributes: {
                    objectclass: ['nisMailAlias'],
                    objectcategory: 'nisMailAlias',
                    cn: alias.name,
                    rfc822MailMember: alias.aliasTarget
                }
            };

            // ensure all filter values are also lowercase
            var lowerCaseFilter = safe(function () { return ldap.parseFilter(req.filter.toString().toLowerCase()); }, null);
            if (!lowerCaseFilter) return next(new ldap.OperationsError(safe.error.toString()));

            if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                res.send(obj);
            }
        });

        res.end();
    });
}

function getMailGroup(req, res, next) {
    debug('mailgroup get: dn %s, scope %s, filter %s (from %s)', req.dn.toString(), req.scope, req.filter.toString(), req.connection.ldap.id);

    // https://docs.oracle.com/cd/E19455-01/806-5580/6jej518pp/index.html
    var get = !!req.dn.rdns[0].attrs.cn;
    var func = get ? mailboxdb.getGroup.bind(null, req.dn.rdns[0].attrs.cn) : mailboxdb.getGroups;
    func(function (error, result) {
        if (error) return next(new ldap.OperationsError(error.toString()));

        var results = util.isArray(result) ? result : [ result ];

        results.forEach(function (group) {
            var dn = ldap.parseDN('cn=' + group.name + ',ou=mailgroups,dc=cloudron');

            var obj = {
                dn: dn.toString(),
                attributes: {
                    objectclass: ['mailGroup'],
                    objectcategory: 'mailGroup',
                    cn: group.name,
                    mail: group.name,
                    mgrpRFC822MailMember: group.members
                }
            };

            // ensure all filter values are also lowercase
            var lowerCaseFilter = safe(function () { return ldap.parseFilter(req.filter.toString().toLowerCase()); }, null);
            if (!lowerCaseFilter) return next(new ldap.OperationsError(safe.error.toString()));

            if ((req.dn.equals(dn) || req.dn.parentOf(dn)) && lowerCaseFilter.matches(obj.attributes)) {
                res.send(obj);
            }
        });

        res.end();
    });
}

function authenticateUser(req, res, next) {
    debug('user bind: %s (from %s)', req.dn.toString(), req.connection.ldap.id);

    // extract the common name which might have different attribute names
    var attributeName = Object.keys(req.dn.rdns[0].attrs)[0];
    var commonName = req.dn.rdns[0].attrs[attributeName].value;
    if (!commonName) return next(new ldap.NoSuchObjectError(req.dn.toString()));

    var api;
    if (attributeName === 'mail') {
        api = user.verifyWithEmail;
    } else if (commonName.indexOf('@') !== -1) { // if mail is specified, enforce mail check
        var parts = commonName.split('@');
        if (parts[1] === config.fqdn()) { // internal email, verify with username
            commonName = parts[0];
            api = user.verifyWithUsername;
        } else { // external email
            api = user.verifyWithEmail;
        }
    } else if (commonName.indexOf('uid-') === 0) {
        api = user.verify;
    } else {
        api = user.verifyWithUsername;
    }

    api(commonName, req.credentials || '', function (error, user) {
        if (error && error.reason === UserError.NOT_FOUND) return next(new ldap.NoSuchObjectError(req.dn.toString()));
        if (error && error.reason === UserError.WRONG_PASSWORD) return next(new ldap.InvalidCredentialsError(req.dn.toString()));
        if (error) return next(new ldap.OperationsError(error.message));

        req.user = user;

        next();
    });
}

function authorizeUserForApp(req, res, next) {
    assert(req.user);

    getAppByRequest(req, function (error, app) {
        if (error) return next(error);

        apps.hasAccessTo(app, req.user, function (error, result) {
            if (error) return next(new ldap.OperationsError(error.toString()));

            // we return no such object, to avoid leakage of a users existence
            if (!result) return next(new ldap.NoSuchObjectError(req.dn.toString()));

            eventlog.add(eventlog.ACTION_USER_LOGIN, { authType: 'ldap', appId: app.id }, { userId: req.user.id });

            res.end();
        });
    });
}

function authorizeUserForMailbox(req, res, next) {
    assert(req.user);

    // We simply authorize the user to access a mailbox by his own name
    mailboxdb.get(req.user.username, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new ldap.NoSuchObjectError(req.dn.toString()));
        if (error) return next(new ldap.OperationsError(error.message));

        eventlog.add(eventlog.ACTION_USER_LOGIN, { authType: 'ldap', mailboxId: req.user.username }, { userId: req.user.username });

        res.end();
    });
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    var logger = {
        trace: NOOP,
        debug: NOOP,
        info: debug,
        warn: debug,
        error: console.error,
        fatal: console.error
    };

    gServer = ldap.createServer({ log: logger });

    gServer.search('ou=users,dc=cloudron', userSearch);
    gServer.search('ou=groups,dc=cloudron', groupSearch);
    gServer.bind('ou=users,dc=cloudron', authenticateUser, authorizeUserForApp);

    // http://www.ietf.org/proceedings/43/I-D/draft-srivastava-ldap-mail-00.txt
    gServer.search('ou=mailboxes,dc=cloudron', getMailbox);
    gServer.search('ou=mailaliases,dc=cloudron', getMailAlias);
    gServer.search('ou=mailgroups,dc=cloudron', getMailGroup);

    gServer.bind('ou=mailboxes,dc=cloudron', authenticateUser, authorizeUserForMailbox);

    // this is the bind for addons (after bind, they might search and authenticate)
    gServer.bind('ou=addons,dc=cloudron', function(req, res, next) {
        debug('addons bind: %s', req.dn.toString()); // note: cn can be email or id
        res.end();
    });

    // this is the bind for apps (after bind, they might search and authenticate user)
    gServer.bind('ou=apps,dc=cloudron', function(req, res, next) {
        // TODO: validate password
        debug('application bind: %s', req.dn.toString());
        res.end();
    });

    gServer.listen(config.get('ldapPort'), '0.0.0.0', callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gServer) gServer.close();

    callback();
}
