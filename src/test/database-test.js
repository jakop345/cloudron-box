'use strict';

/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

var database = require('../database'),
    expect = require('expect.js');

describe('database', function () {
    it('remove privates', function () {
        var obj = {
            username: 'username',
            _password: 'password',
            email: 'girs@foc.com',
            _salt: 'morton'
        };
        var result = database.removePrivates(obj);
        expect(result.username).to.equal('username');
        expect(result.email).to.equal('girs@foc.com');
        expect(result._password).to.not.be.ok();
        expect(result._salt).to.not.be.ok();
    });
});

