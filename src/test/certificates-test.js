/* global it:false */
/* global describe:false */
/* global before:false */
/* global after:false */

'use strict';

var async = require('async'),
    certificates = require('../certificates.js'),
    config = require('../config.js'),
    database = require('../database.js'),
    expect = require('expect.js'),
    settings = require('../settings.js');

function setup(done) {
    async.series([
        database.initialize,
        database._clear
    ], done);
}

function cleanup(done) {
    database._clear(done);
}

describe('Certificates', function () {
    describe('validateCertificate', function () {
        /*
          Generate these with:
            openssl genrsa -out server.key 512
            openssl req -new -key server.key -out server.csr -subj "/C=DE/ST=Berlin/L=Berlin/O=Nebulon/OU=CTO/CN=baz.foobar.com"
            openssl x509 -req -days 1460 -in server.csr -signkey server.key -out server.crt
        */

        // foobar.com
        var validCert0 = '-----BEGIN CERTIFICATE-----\nMIIBujCCAWQCCQDuY8krIDA+KzANBgkqhkiG9w0BAQsFADBkMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzETMBEGA1UEAwwKZm9vYmFyLmNvbTAeFw0xNjEx\nMDgwODI2MTRaFw0yMDExMDcwODI2MTRaMGQxCzAJBgNVBAYTAkRFMQ8wDQYDVQQI\nDAZCZXJsaW4xDzANBgNVBAcMBkJlcmxpbjEQMA4GA1UECgwHTmVidWxvbjEMMAoG\nA1UECwwDQ1RPMRMwEQYDVQQDDApmb29iYXIuY29tMFwwDQYJKoZIhvcNAQEBBQAD\nSwAwSAJBALmlwGXb1B9OzZIE9E6eKG1pZJ3P6Sy2tNAWiQ0658uyZhD1udGMNGM1\nRs9IRX+J5p+rAlPglNiG/ArOZtIES8MCAwEAATANBgkqhkiG9w0BAQsFAANBAER1\nxTRc7NQxYYhwld2/gIW5nBJMel7LxYzNlDCbRo1T8a7K6Y4kugORKFidyTjIbsAP\n84gnjmQl9NvBmv33yFk=\n-----END CERTIFICATE-----';
        var validKey0 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBALmlwGXb1B9OzZIE9E6eKG1pZJ3P6Sy2tNAWiQ0658uyZhD1udGM\nNGM1Rs9IRX+J5p+rAlPglNiG/ArOZtIES8MCAwEAAQJAZhXVVK2rWYP12uPKjCjA\nRln8MCOSLzpQ91RNDO9lY0bIpU+9YfKyyeEPWvFKsvBPTFaS0nyGIiZYIoYoZpCJ\nsQIhAODmkO+UsKTmGKMHqvvmN1Am9zisbiwLqw1F/5g/q6PfAiEA01GhntKZ6vqp\nhihca3tEZKDA3URI/axHTxLKCnp4tJ0CIDFu3Gqcrxr/rGihNdb6aiwG9I4TcH/j\n7KwVN7H6RLrXAiEAyDhtKP2kJncPznRJdPEbkTia5EtB2VC1U9+anSkDWyUCICLn\ngje2pXjZfRtcp49uM/WrQhBifrpuqFSIrLNU3Eb5\n-----END RSA PRIVATE KEY-----';

        // *.foobar.com
        var validCert1 = '-----BEGIN CERTIFICATE-----\nMIIBvjCCAWgCCQDLKYLGisj0djANBgkqhkiG9w0BAQsFADBmMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzEVMBMGA1UEAwwMKi5mb29iYXIuY29tMB4XDTE2\nMTEwODA4MjcxNloXDTIwMTEwNzA4MjcxNlowZjELMAkGA1UEBhMCREUxDzANBgNV\nBAgMBkJlcmxpbjEPMA0GA1UEBwwGQmVybGluMRAwDgYDVQQKDAdOZWJ1bG9uMQww\nCgYDVQQLDANDVE8xFTATBgNVBAMMDCouZm9vYmFyLmNvbTBcMA0GCSqGSIb3DQEB\nAQUAA0sAMEgCQQDXApN6RG4Q6VqJbPsfZNin29V57giGmA81icZFiU0ARv8V0SRF\nShRqPo7iem+0mfH3PgGmauOP+xEu6rFJbZQPAgMBAAEwDQYJKoZIhvcNAQELBQAD\nQQAZxeVrCNoXIs4jtCxgyTDoyFM5IGkq1dlM2CvZW+z3JV8ReCJOw1OEVgd0jIQs\nqZtqd7CQqyWiPMk/QhNInlEd\n-----END CERTIFICATE-----';
        var validKey1 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBPAIBAAJBANcCk3pEbhDpWols+x9k2Kfb1XnuCIaYDzWJxkWJTQBG/xXRJEVK\nFGo+juJ6b7SZ8fc+AaZq44/7ES7qsUltlA8CAwEAAQJBAMyD1MgeQxuu+8FwekXY\nZQT15E9AjbeI+B6S2JfYC/hP0AcGldmQ03KD8N497OOwuagEOZcGdS1eU45E224l\n6DECIQD+yLV6K7BUISdnIXvjkmjkwm1pQNWh4T5o3dArW4Hi+wIhANgJRaF5tbBF\ntYbFzdaDwkPlQurtUM5il/Trci9Q7Sb9AiEA+s2Wn2HcXKSaRhIXA2j/apjd3Ste\nYND6f35CSjv0+vsCIBrIg35ydWkGK2wrB8rpiOMcAEDZ7SO5K3es3PoqwUwNAiEA\n1CAqYa+GI9vDIwDJuInK3k/u4VlsiQiPdjoBySI+bDY=\n-----END RSA PRIVATE KEY-----';

        // baz.foobar.com
        var validCert2 = '-----BEGIN CERTIFICATE-----\nMIIBwjCCAWwCCQCZjm6jL50XfTANBgkqhkiG9w0BAQsFADBoMQswCQYDVQQGEwJE\nRTEPMA0GA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05l\nYnVsb24xDDAKBgNVBAsMA0NUTzEXMBUGA1UEAwwOYmF6LmZvb2Jhci5jb20wHhcN\nMTYxMTA4MDgyMDE1WhcNMjAxMTA3MDgyMDE1WjBoMQswCQYDVQQGEwJERTEPMA0G\nA1UECAwGQmVybGluMQ8wDQYDVQQHDAZCZXJsaW4xEDAOBgNVBAoMB05lYnVsb24x\nDDAKBgNVBAsMA0NUTzEXMBUGA1UEAwwOYmF6LmZvb2Jhci5jb20wXDANBgkqhkiG\n9w0BAQEFAANLADBIAkEAtKoyTPrf2DjKbnW7Xr1HbRvV+quHTcGmUq5anDI7G4w/\nabqDXGYyakHHlPyZxYp7FWQxCm83rHUuDT1LiLIBZQIDAQABMA0GCSqGSIb3DQEB\nCwUAA0EAVaD2Q6bF9hcUUBev5NyjaMdDYURuWfjuwWUkb8W50O2ed3O+MATKrDdS\nyVaBy8W02KJ4Y1ym4je/MF8nilPurA==\n-----END CERTIFICATE-----';
        var validKey2 = '-----BEGIN RSA PRIVATE KEY-----\nMIIBPQIBAAJBALSqMkz639g4ym51u169R20b1fqrh03BplKuWpwyOxuMP2m6g1xm\nMmpBx5T8mcWKexVkMQpvN6x1Lg09S4iyAWUCAwEAAQJBAJXu7YHPbjfuoalcUZzF\nbuKRCFtZQRf5z0Os6QvZ8A3iR0SzYJzx+c2ibp7WdifMXp3XaKm4tHSOfumrjUIq\nt10CIQDrs9Xo7bq0zuNjUV5IshNfaiYKZRfQciRVW2O8xBP9VwIhAMQ5CCEDZy+u\nsaF9RtmB0bjbe6XonBlAzoflfH/MAwWjAiEA50hL+ohr0MfCMM7DKaozgEj0kvan\n645VQLywnaX5x3kCIQDCwjinS9FnKmV0e/uOd6PJb0/S5IXLKt/TUpu33K5DMQIh\nAM9peu3B5t9pO59MmeUGZwI+bEJfEb+h03WTptBxS3pO\n-----END RSA PRIVATE KEY-----';

        it('allows both null', function () {
            expect(certificates.validateCertificate(null, null, 'foobar.com')).to.be(null);
        });

        it('does not allow only cert', function () {
            expect(certificates.validateCertificate('cert', null, 'foobar.com')).to.be.an(Error);
        });

        it('does not allow only key', function () {
            expect(certificates.validateCertificate(null, 'key', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow empty string for cert', function () {
            expect(certificates.validateCertificate('', 'key', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow empty string for key', function () {
            expect(certificates.validateCertificate('cert', '', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow invalid cert', function () {
            expect(certificates.validateCertificate('someinvalidcert', validKey0, 'foobar.com')).to.be.an(Error);
        });

        it('does not allow invalid key', function () {
            expect(certificates.validateCertificate(validCert0, 'invalidkey', 'foobar.com')).to.be.an(Error);
        });

        it('does not allow cert without matching domain', function () {
            expect(certificates.validateCertificate(validCert0, validKey0, 'cloudron.io')).to.be.an(Error);
        });

        it('allows valid cert with matching domain', function () {
            expect(certificates.validateCertificate(validCert0, validKey0, 'foobar.com')).to.be(null);
        });

        it('allows valid cert with matching domain (wildcard)', function () {
            expect(certificates.validateCertificate(validCert1, validKey1, 'abc.foobar.com')).to.be(null);
        });

        it('does now allow cert without matching domain (wildcard)', function () {
            expect(certificates.validateCertificate(validCert1, validKey1, 'foobar.com')).to.be.an(Error);
            expect(certificates.validateCertificate(validCert1, validKey1, 'bar.abc.foobar.com')).to.be.an(Error);
        });

        it('allows valid cert with matching domain (subdomain)', function () {
            expect(certificates.validateCertificate(validCert2, validKey2, 'baz.foobar.com')).to.be(null);
        });

        it('does not allow cert without matching domain (subdomain)', function () {
            expect(certificates.validateCertificate(validCert0, validKey0, 'baz.foobar.com')).to.be.an(Error);
        });

        it('does not allow invalid cert/key tuple', function () {
            expect(certificates.validateCertificate(validCert0, validKey1, 'foobar.com')).to.be.an(Error);
        });
    });

    describe('getApi - caas', function () {
        before(function (done) {
            async.series([
                setup,
                settings.setTlsConfig.bind(null, { provider: 'caas' })
            ], done);
        });

        after(cleanup);

        it('returns prod caas for prod cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://prod/release.json');

            certificates._getApi({ }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('caas');
                expect(options.prod).to.be(true);
                done();
            });
        });

        it('returns non-prod caas for dev cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://dev/release.json');

            certificates._getApi({ }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('caas');
                expect(options.prod).to.be(false);
                done();
            });
        });

        it('returns prod-acme with altDomain in prod cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://prod/release.json');

            certificates._getApi({ altDomain: 'foo.something.com' }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(true);
                done();
            });
        });

        it('returns non-prod acme with altDomain in dev cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://dev/release.json');

            certificates._getApi({ altDomain: 'foo.something.com' }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(false);
                done();
            });
        });
    });

    describe('getApi - le-prod', function () {
        before(function (done) {
            async.series([
                setup,
                settings.setTlsConfig.bind(null, { provider: 'le-prod' })
            ], done);
        });

        after(cleanup);

        it('returns prod acme in prod cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://prod/release.json');

            certificates._getApi({ }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(true);
                done();
            });
        });

        it('returns prod acme with altDomain in prod cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://prod/release.json');

            certificates._getApi({ altDomain: 'foo.bar.com' }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(true);
                done();
            });
        });

        it('returns prod acme in dev cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://dev/release.json');

            certificates._getApi({ }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(true);
                done();
            });
        });
    });

    describe('getApi - le-staging', function () {
        before(function (done) {
            async.series([
                setup,
                settings.setTlsConfig.bind(null, { provider: 'le-staging' })
            ], done);
        });

        after(cleanup);

        it('returns staging acme in prod cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://prod/release.json');

            certificates._getApi({ }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(false);
                done();
            });
        });

        it('returns staging acme in dev cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://dev/release.json');

            certificates._getApi({ }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(false);
                done();
            });
        });

        it('returns staging acme with altDomain in prod cloudron', function (done) {
            config.set('boxVersionsUrl', 'http://prod/release.json');

            certificates._getApi({ altDomain: 'foo.bar.com' }, function (error, api, options) {
                expect(error).to.be(null);
                expect(api._name).to.be('acme');
                expect(options.prod).to.be(false);
                done();
            });
        });
    });
});
