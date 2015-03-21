/* jslint node:true */
/* global describe:true */
/* global before:true */
/* global it:true */

'use strict';

var expect = require('expect.js'),
    manifestFormat = require('../manifestformat.js'),
    safe = require('safetydance'),
    _ = require('underscore');

describe('parseManifest', function () {
    it('errors for empty string', function () {
        expect(manifestFormat.parseString('').error).to.be.an(Error);
    });

    it('errors for invalid json', function () {
        expect(manifestFormat.parseString('garbage').error).to.be.an(Error);
    });

    var manifest = {
        id: 'io.cloudron.test',
        title: 'Bar App',
        description: 'Long long ago, there was foo',
        tagline: 'Not your usual Foo App',
        manifestVersion: 1,
        version: '0.1.2',
        dockerImage: 'girish/foo:0.2',
        healthCheckPath: '/',
        httpPort: 23,
        website: 'https://example.com',
        contactEmail: 'support@example.com'
    };

    manifestFormat.SCHEMA.required.forEach(function (key) {
        var manifestCopy = _.extend({ }, manifest);
        delete manifestCopy[key];
        it('errors for missing ' + key, function () {
            expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
        });
    });

    new Array(null, [ 23 ], [ "mysql", 34 ], [ null, "mysql" ]).forEach(function (invalidAddon, idx) {
        it('fails for invalid addon testcase ' + idx, function () {
            var manifestCopy = _.extend({ }, manifest);
            manifestCopy.addons = invalidAddon;
            expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
        });
    });

    it('fails for bad version', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.version = '0.2';
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
    });

    it('fails for bad id', function () {
        var manifestCopy = _.extend({ }, manifest);
        ['simply', '12de', 'in..x', 'x.com', 'no.hy-phen' ].forEach(function(badId) {
            manifestCopy.id = badId;
            expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
        });
    });

    it('fails for bad minBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.minBoxVersion = '0.2';
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
    });

    it('fails for bad maxBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.maxBoxVersion = '0.2';
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
    });

    it('fails for bad targetBoxVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.targetBoxVersion = '0.2';
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
    });

    it('fails for bad manifestVersion', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.manifestVersion = 2;
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
    });

    it('fails for bad tcpPorts', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.tcpPorts = 45;

        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);
    });

    it('fails for bad tcpPorts', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.tcpPorts = 45;
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error);

        manifestCopy.tcpPorts = { "env$": { } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad env

        manifestCopy.tcpPorts = { "env": { } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // missing description

        manifestCopy.tcpPorts = { "env": { description: 34 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad description

        manifestCopy.tcpPorts = { "env": { title: 34 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad title

        manifestCopy.tcpPorts = { "env": { title: "this", description: "long enough" } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // short title

        manifestCopy.tcpPorts = { "env": { description: "description", containerPort: "invalid" } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad containerPort

        manifestCopy.tcpPorts = { "env": { description: "description", containerPort: NaN } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad containerPort

        manifestCopy.tcpPorts = { "env": { description: "description", containerPort: -2 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad containerPort

        manifestCopy.tcpPorts = { "env": { description: "description", defaultValue: "invalid" } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad defaultValue

        manifestCopy.tcpPorts = { "env": { description: "description", defaultValue: NaN } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad defaultValue

        manifestCopy.tcpPorts = { "env": { description: "description", defaultValue: -2 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad defaultValue

        manifestCopy.tcpPorts = { "env": { description: "description", defaultValue: 1000 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).error).to.be.an(Error); // bad defaultValue
    });

    it('succeeds for good tcpPorts', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.tcpPorts = { "env": { title: "12345", description: "12345", containerPort: 546 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).manifest).to.eql(manifestCopy);

        manifestCopy = _.extend({ }, manifest);
        manifestCopy.tcpPorts = { "env": { title: "12345", description: "12345", containerPort: 65535 } };
        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).manifest).to.eql(manifestCopy);
    });

    it('succeeds for minimal valid manifest', function () {
        expect(manifestFormat.parseString(JSON.stringify(manifest)).manifest).to.eql(manifest);
    });

    it('succeeds for maximal valid manifest', function () {
        var manifestCopy = _.extend({ }, manifest);
        manifestCopy.minBoxVersion = '0.0.1';
        manifestCopy.maxBoxVersion = '1.0.0';
        manifestCopy.targetBoxVersion = '1.0.0';
        manifestCopy.addons = [ "mysql", "postgresql" ];

        expect(manifestFormat.parseString(JSON.stringify(manifestCopy)).manifest).to.eql(manifestCopy);
    });
});

