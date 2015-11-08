/* jslint node:true */
/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var database = require('../database.js'),
    expect = require('expect.js'),
    settings = require('../settings.js');

function setup(done) {
    // ensure data/config/mount paths
    database.initialize(function (error) {
        expect(error).to.be(null);
        done();
    });
}

function cleanup(done) {
    database._clear(done);
}

describe('Settings', function () {
    describe('values', function () {
        before(setup);
        after(cleanup);

        it('can get default timezone', function (done) {
            settings.getTimeZone(function (error, tz) {
                expect(error).to.be(null);
                expect(tz.length).to.not.be(0);
                done();
            });
        });

        it('can get default autoupdate_pattern', function (done) {
            settings.getAutoupdatePattern(function (error, pattern) {
                expect(error).to.be(null);
                expect(pattern).to.be('00 00 1,3,5,23 * * *');
                done();
            });
        });

        it ('can get default cloudron name', function (done) {
            settings.getCloudronName(function (error, name) {
                expect(error).to.be(null);
                expect(name).to.be('Cloudron');
                done();
            });
        });

        it('can get default cloudron avatar', function (done) {
            settings.getCloudronAvatar(function (error, gravatar) {
                expect(error).to.be(null);
                expect(gravatar).to.be.a(Buffer);
                done();
            });
        });

        it('can get default developer mode', function (done) {
            settings.getDeveloperMode(function (error, enabled) {
                expect(error).to.be(null);
                expect(enabled).to.equal(false);
                done();
            });
        });

        it('can set developer mode', function (done) {
            settings.setDeveloperMode(true, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('can get developer mode', function (done) {
            settings.getDeveloperMode(function (error, enabled) {
                expect(error).to.be(null);
                expect(enabled).to.equal(true);
                done();
            });
        });

        it('can set dns config', function (done) {
            settings.setDnsConfig({ provider: 'route53', accessKeyId: 'accessKeyId', secretAccessKey: 'secretAccessKey' }, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('can get dns config', function (done) {
            settings.getDnsConfig(function (error, dnsConfig) {
                expect(error).to.be(null);
                expect(dnsConfig.provider).to.be('route53');
                expect(dnsConfig.accessKeyId).to.be('accessKeyId');
                expect(dnsConfig.secretAccessKey).to.be('secretAccessKey');
                expect(dnsConfig.region).to.be('us-east-1');
                done();
            });
        });

        it('can set backup config', function (done) {
            settings.setBackupConfig({ provider: 'caas', token: 'TOKEN' }, function (error) {
                expect(error).to.be(null);
                done();
            });
        });

        it('can get backup config', function (done) {
            settings.getBackupConfig(function (error, dnsConfig) {
                expect(error).to.be(null);
                expect(dnsConfig.provider).to.be('caas');
                expect(dnsConfig.token).to.be('TOKEN');
                done();
            });
        });

        it('can get all values', function (done) {
            settings.getAll(function (error, allSettings) {
                expect(error).to.be(null);
                expect(allSettings[settings.TIME_ZONE_KEY]).to.be.a('string');
                expect(allSettings[settings.AUTOUPDATE_PATTERN_KEY]).to.be.a('string');
                expect(allSettings[settings.CLOUDRON_NAME_KEY]).to.be.a('string');
                done();
            });
        });
    });

    describe('validateCertificate', function () {
        before(setup);
        after(cleanup);

        /*
          Generate these with:
            openssl genrsa -out server.key 512
            openssl req -new -key server.key -out server.csr -subj "/C=DE/ST=Berlin/L=Berlin/O=Nebulon/OU=CTO/CN=baz.foobar.com"
            openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt
        */

        // foobar.com
        var validCert0 = '-----BEGIN CERTIFICATE-----\nMIIBujCCAWQCCQCjLyTKzAJ4FDANBgkqhkiG9w0BAQsFADBkMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzETMBEGA1UEAwwKZm9vYmFyLmNvbTAeFw0xNTEw\nMjgxMjM5MjZaFw0xNjEwMjcxMjM5MjZaMGQxCzAJBgNVBAYTAkRFMQ8wDQYDVQQI\nDAZCZXJsaW4xDzANBgNVBAcMBkJlcmxpbjEQMA4GA1UECgwHTmVidWxvbjEMMAoG\nA1UECwwDQ1RPMRMwEQYDVQQDDApmb29iYXIuY29tMFwwDQYJKoZIhvcNAQEBBQAD\nSwAwSAJBAMeYofgwHeNVmGkGe0gj4dnX2ciifDi7X2K/oVHp7mxuHjGMSYP9Z7b6\n+mu0IMf4OedwXStHBeO8mwjKxZmE7p8CAwEAATANBgkqhkiG9w0BAQsFAANBAJI7\nFUUHXjR63UFk8pgxp0c7hEGqj4VWWGsmo8oZnnX8jGVmQDKbk8o3MtDujfqupmMR\nMo7tSAFlG7zkm3GYhpw=\n-----END CERTIFICATE-----';
        var validKey0 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOwIBAAJBAMeYofgwHeNVmGkGe0gj4dnX2ciifDi7X2K/oVHp7mxuHjGMSYP9\nZ7b6+mu0IMf4OedwXStHBeO8mwjKxZmE7p8CAwEAAQJBAJS59Sb8o6i8JT9NJxvQ\nMQCkSJGqEaosZJ0uccSZ7aE48v+H7HiPzXAueitohcEif2Wp1EZ1RbRMURhznNiZ\neLECIQDxxqhakO6wc7H68zmpRXJ5ZxGUNbM24AMtpONAtEw9iwIhANNWtp6P74OV\ntvfOmtubbqw768fmGskFCOcp5oF8oF29AiBkTAf9AhCyjFwyAYJTEScq67HkLN66\njfVjkvpfFixmfwIgI+xldmZ5DCDyzQSthg7RrS0yUvRmMS1N6h1RNUl96PECIQDl\nit4lFcytbqNo1PuBZvzQE+plCjiJqXHYo3WCst1Jbg==\n-----END RSA PRIVATE KEY-----';

        // *.foobar.com
        var validCert1 = '-----BEGIN CERTIFICATE-----\nMIIBvjCCAWgCCQCg957GWuHtbzANBgkqhkiG9w0BAQsFADBmMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzEVMBMGA1UEAwwMKi5mb29iYXIuY29tMB4XDTE1\nMTAyODEzMDI1MFoXDTE2MTAyNzEzMDI1MFowZjELMAkGA1UEBhMCREUxDzANBgNV\nBAgMBkJlcmxpbjEPMA0GA1UEBwwGQmVybGluMRAwDgYDVQQKDAdOZWJ1bG9uMQww\nCgYDVQQLDANDVE8xFTATBgNVBAMMDCouZm9vYmFyLmNvbTBcMA0GCSqGSIb3DQEB\nAQUAA0sAMEgCQQC0FKf07ZWMcABFlZw+GzXK9EiZrlJ1lpnu64RhN99z7MXRr8cF\nnZVgY3jgatuyR5s3WdzUvye2eJ0rNicl2EZJAgMBAAEwDQYJKoZIhvcNAQELBQAD\nQQAw4bteMZAeJWl2wgNLw+wTwAH96E0jyxwreCnT5AxJLmgimyQ0XOF4FsssdRFj\nxD9WA+rktelBodJyPeTDNhIh\n-----END CERTIFICATE-----';
        var validKey1 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOQIBAAJBALQUp/TtlYxwAEWVnD4bNcr0SJmuUnWWme7rhGE333PsxdGvxwWd\nlWBjeOBq27JHmzdZ3NS/J7Z4nSs2JyXYRkkCAwEAAQJALV2eykcoC48TonQEPmkg\nbhaIS57syw67jMLsQImQ02UABKzqHPEKLXPOZhZPS9hsC/hGIehwiYCXMUlrl+WF\nAQIhAOntBI6qaecNjAAVG7UbZclMuHROUONmZUF1KNq6VyV5AiEAxRLkfHWy52CM\njOQrX347edZ30f4QczvugXwsyuU9A1ECIGlGZ8Sk4OBA8n6fAUcyO06qnmCJVlHg\npTUeOvKk5c9RAiBs28+8dCNbrbhVhx/yQr9FwNM0+ttJW/yWJ+pyNQhr0QIgJTT6\nxwCWYOtbioyt7B9l+ENy3AMSO3Uq+xmIKkvItK4=\n-----END RSA PRIVATE KEY-----';

        // baz.foobar.com
        var validCert2 = '-----BEGIN CERTIFICATE-----\nMIIBwjCCAWwCCQDIKtL9RCDCkDANBgkqhkiG9w0BAQsFADBoMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzEXMBUGA1UEAwwOYmF6LmZvb2Jhci5jb20wHhcN\nMTUxMDI4MTMwNTMzWhcNMTYxMDI3MTMwNTMzWjBoMQswCQYDVQQGEwJERTEPMA0G\nA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05lYnVsb24x\nDDAKBgNVBAsMA0NUTzEXMBUGA1UEAwwOYmF6LmZvb2Jhci5jb20wXDANBgkqhkiG\n9w0BAQEFAANLADBIAkEAw7UWW/VoQePv2l92l3XcntZeyw1nBiHxk1axZwC6auOW\n2/zfA//Tg7fv4q5qKnV1n/71IiMAheeFcpfogY5rTwIDAQABMA0GCSqGSIb3DQEB\nCwUAA0EAtluL6dGNfOdNkzoO/UwzRaIvEm2reuqe+Ik4WR/k+DJ4igrmRCQqXwjW\nJaGYsFWsuk3QLOWQ9YgCKlcIYd+1/A==\n-----END CERTIFICATE-----';
        var validKey2 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOQIBAAJBAMO1Flv1aEHj79pfdpd13J7WXssNZwYh8ZNWsWcAumrjltv83wP/\n04O37+Kuaip1dZ/+9SIjAIXnhXKX6IGOa08CAwEAAQJAUPD3Y2cXDJFaJQXwhWnw\nqhzdLbvITUgCor5rNr+dWhE2MopGPpRHiabA1PeWEPx8CfblyTZGd8KUR/2W1c0r\naQIhAP4ZxB3+uhuzzMfyRrn/khr12pFn/FCIDbwnDbyUxLrTAiEAxSuVOFs+Mupt\nYCz/pPrDCx3eid0wyXRObbkLHOxJiBUCIBTp5fxaBNNW3xnt1OhmIo5Zgd3J4zh1\nmjvMMxM8Y1zFAiAxOP0qsZSoj1+41+MGY9fXaaCJ2F96m3+M4tpEYTTGNQIgdESZ\nz+hzHBeYVbWJpIR8uaNkx7wveUF90FpipXyeTsA=\n-----END RSA PRIVATE KEY-----';

        it('allows both null', function () {
            expect(settings.validateCertificate(null, null, 'foobar.com')).to.be(null);
        });

        it('does not allow only cert', function () {
            expect(settings.validateCertificate('cert', null, 'foobar.com')).to.be.an(Error);
        });

        it('does not allow only key', function () {
            expect(settings.validateCertificate(null, 'key', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow empty string for cert', function () {
            expect(settings.validateCertificate('', 'key', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow empty string for key', function () {
            expect(settings.validateCertificate('cert', '', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow invalid cert', function () {
            expect(settings.validateCertificate('someinvalidcert', validKey0, 'foobar.com')).to.be.an(Error);
        });

        it('does not allow invalid key', function () {
            expect(settings.validateCertificate(validCert0, 'invalidkey', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow cert without matching domain', function () {
            expect(settings.validateCertificate(validCert0, validKey0, 'cloudron.io')).to.be.an(Error);
        });

        it('allows valid cert with matching domain', function () {
            expect(settings.validateCertificate(validCert0, validKey0, 'foobar.com')).to.be(null);
        });

        it('allows valid cert with matching domain (wildcard)', function () {
            expect(settings.validateCertificate(validCert1, validKey1, 'abc.foobar.com')).to.be(null);
        });

        it('does now allow cert without matching domain (wildcard)', function () {
            expect(settings.validateCertificate(validCert1, validKey1, 'foobar.com')).to.be.an(Error);
            expect(settings.validateCertificate(validCert1, validKey1, 'bar.abc.foobar.com')).to.be.an(Error);
        });

        it('allows valid cert with matching domain (subdomain)', function () {
            expect(settings.validateCertificate(validCert2, validKey2, 'baz.foobar.com')).to.be(null);
        });

        it('does not allow cert without matching domain (subdomain)', function () {
            expect(settings.validateCertificate(validCert0, validKey0, 'baz.foobar.com')).to.be.an(Error);
        });

        it('does not allow invalid cert/key tuple', function () {
            expect(settings.validateCertificate(validCert0, validKey1, 'foobar.com')).to.be.an(Error);
        });
    });
});
