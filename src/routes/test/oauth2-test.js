/* jslint node:true */
/* global it:false */
/* global describe:false */

'use strict';

var expect = require('expect.js'),
    HttpError = require('../../httperror.js'),
    oauth2 = require('../oauth2.js');

describe('OAuth2', function () {
    describe('scopes middleware', function () {
        it('fails due to missing authInfo', function (done) {
            var mw = oauth2.scope('admin');
            var req = {};

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to missing scope property in authInfo', function (done) {
            var mw = oauth2.scope('admin');
            var req = { authInfo: {} };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to missing scope in request', function (done) {
            var mw = oauth2.scope('admin');
            var req = { authInfo: { scope: '' } };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to wrong scope in request', function (done) {
            var mw = oauth2.scope('admin');
            var req = { authInfo: { scope: 'foobar,something' } };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('fails due to wrong scope in request', function (done) {
            var mw = oauth2.scope('admin,users');
            var req = { authInfo: { scope: 'foobar,admin' } };

            mw(req, null, function (error) {
                expect(error).to.be.a(HttpError);
                done();
            });
        });

        it('succeeds with one requested scope and one provided scope', function (done) {
            var mw = oauth2.scope('admin');
            var req = { authInfo: { scope: 'admin' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with one requested scope and two provided scopes', function (done) {
            var mw = oauth2.scope('admin');
            var req = { authInfo: { scope: 'foobar,admin' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with two requested scope and two provided scopes', function (done) {
            var mw = oauth2.scope('admin,foobar');
            var req = { authInfo: { scope: 'foobar,admin' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });

        it('succeeds with two requested scope and provided wildcard scope', function (done) {
            var mw = oauth2.scope('admin,foobar');
            var req = { authInfo: { scope: '*' } };

            mw(req, null, function (error) {
                expect(error).to.not.be.ok();
                done();
            });
        });
    });
});

