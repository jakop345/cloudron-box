'use strict';

var crypto = require('crypto');

// This code is taken from https://github.com/fabdrol/node-aes-helper
module.exports = {
    algorithm: 'AES-256-CBC',
    salt: 'RgA{[A0+#I@]CK|U)}>yv9Y58CkJp3}UOV#xK,Lz@8@VE>?9fR;K]isV*+qX10o4',

    key: function (password) {
        var key = this.salt + password;
        var hash = crypto.createHash('sha1');

        hash.update(key, 'utf8');
        return hash.digest('hex');
    },

    encrypt: function (plain, password) {
        var key = this.key(password);
        var cipher = crypto.createCipher(this.algorithm, key);
        var crypted  = cipher.update(plain, 'utf8', 'hex');
        crypted += cipher.final('hex');

        return crypted;
    },

    decrypt: function (crypted, password) {
        var key = this.key(password);
        var decipher = crypto.createDecipher(this.algorithm, key);
        var decoded  = decipher.update(crypted, 'hex', 'utf8');
        decoded += decipher.final('utf8');

        return decoded;
    }
};

