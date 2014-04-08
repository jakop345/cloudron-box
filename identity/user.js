'use strict';

var userdb = require('./userdb'),
    ursa = require('ursa'),
    assert = require('assert'),
    crypto = require('crypto'),
    aes = require('../common/aes-helper.js'),
    tokendb = require('./tokendb'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('authserver:user'),
    HttpError = require('../common/httperror'),
    HttpSuccess = require('../common/httpsuccess');

exports = module.exports = {
    owner: owner,
    add: add,
    get: get,
    getAll: getAll,
    remove: remove,
    token: token,
    verify: verify
};

var CRYPTO_SALT_SIZE = 64; // 512-bit salt
var CRYPTO_ITERATIONS = 10000; // iterations
var CRYPTO_KEY_LENGTH = 512; // bits

function owner(req, res, next) {
    debug('add owner: ' + req.body.username + ' ' + req.body.password + ' ' + req.body.email);

    req.temporaryAdminFlag = true;

    add(req, res, next);
}

function add(req, res, next) {
    debug('add user: ' + req.body.username + ' ' + req.body.password + ' ' + req.body.email);

    if (!req.body.username) return next(new HttpError(400, 'No username provided'));
    if (!req.body.password) return next(new HttpError(400, 'No password provided'));
    if (!req.body.email) return next(new HttpError(400, 'No email provided'));

    crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
        if (error) {
            console.error('Failed to generate random bytes.', error);
            return next(new HttpError(500));
        }

        crypto.pbkdf2(req.body.password, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) {
                console.error('Failed to hash password.', error);
                return next(new HttpError(500));
            }

            // now generate the pub/priv keypairs for volume header
            var keyPair = ursa.generatePrivateKey();

            var now = (new Date()).toUTCString();
            var user = {
                username: req.body.username,
                email: req.body.email,
                password: new Buffer(derivedKey, 'binary').toString('hex'),
                privatePemCipher: aes.encrypt(keyPair.toPrivatePem(), req.body.password, salt),
                publicPem: keyPair.toPublicPem(),
                admin: !!req.temporaryAdminFlag,
                salt: salt.toString('hex'),
                created_at: now,
                updated_at: now
            };

            userdb.add(req.body.username, user, function (error) {
                if (error && error.reason === DatabaseError.ALREADY_EXISTS) return next(new HttpError(409, 'User already exists'));
                if (error) return next(new HttpError(500));
                next(new HttpSuccess(201, {}));
            });
        });
    });
}

function get(req, res, next) {
    debug('get: ' + req.params.userId);

    if (!req.params.userId) return next(new HttpError(400, 'No userId provided'));

    userdb.get(req.params.userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such user'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, userdb.removePrivates(user)));
    });
}

function getAll(req, res, next) {
    debug('getAll');

    userdb.getAll(function (error, result) {
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, { users: result }));
    });
}

function remove(req, res, next) {
    debug('remove: ' + req.params.userId + ' ' + req.body.password);

    if (!req.params.userId) return next(new HttpError(400, 'No username provided'));
    // if (!req.body.password) return next(new HttpError(400, 'No password provided'));

    // TODO check password
    userdb.del(req.params.userId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such user'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, {}));
    });
}

function token(req, res, next) {
    debug('token: ' + JSON.stringify(req.user));

    var accessToken = tokendb.generateToken();
    tokendb.add(accessToken, req.user.id, null, function (error) {
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, { accessToken: accessToken }));
    });
}

function verify(username, password, callback) {
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof callback === 'function');

    userdb.get(username, function (error, user) {
        if (error) return callback(error);

        var saltBinary = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(error);

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== user.password)  {
                return callback(null, false);
            }

            callback(null, user);
        });
    });
}
