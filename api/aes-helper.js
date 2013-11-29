'use strict';

var crypto = require('crypto');

// This code is taken from https://github.com/fabdrol/node-aes-helper
module.exports = {
    algorithm: 'AES-256-CBC',

    key: function (password, salt) {
        var key = salt.toString('utf8') + password;
        var hash = crypto.createHash('sha1');

        hash.update(key, 'utf8');
        return hash.digest('hex');
    },

    encrypt: function (plain, password, salt) {
        var key = this.key(password, salt);
        var cipher = crypto.createCipher(this.algorithm, key);
        var crypted;

        try {
            crypted = cipher.update(plain, 'utf8', 'hex');
            crypted += cipher.final('hex');
        } catch (e) {
            console.error('Encryption error:', e);
            crypted = '';
        }

        return crypted;
    },

    decrypt: function (crypted, password, salt) {
        var key = this.key(password, salt);
        var decipher = crypto.createDecipher(this.algorithm, key);
        var decoded;

        try {
            decoded = decipher.update(crypted, 'hex', 'utf8');
            decoded += decipher.final('utf8');
        } catch (e) {
            console.error('Decryption error:', e);
            decoded = '';
        }

        return decoded;
    }
};

