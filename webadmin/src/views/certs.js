'use strict';

angular.module('Application').controller('CertsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.config = Client.getConfig();
    $scope.dnsConfig = null;

    $scope.defaultCert = {
        error: null,
        success: false,
        busy: false,
        certificateFile: null,
        certificateFileName: '',
        keyFile: null,
        keyFileName: ''
    };

    $scope.adminCert = {
        error: null,
        success: false,
        busy: false,
        certificateFile: null,
        certificateFileName: '',
        keyFile: null,
        keyFileName: ''
    };

    $scope.dnsCredentials = {
        error: null,
        success: false,
        busy: false,
        accessKeyId: '',
        secretAccessKey: '',
        provider: 'route53'
    };

    function readFileLocally(obj, file, fileName) {
        return function (event) {
            $scope.$apply(function () {
                obj[file] = null;
                obj[fileName] = event.target.files[0].name;

                var reader = new FileReader();
                reader.onload = function (result) {
                    if (!result.target || !result.target.result) return console.error('Unable to read local file');
                    obj[file] = result.target.result;
                };
                reader.readAsText(event.target.files[0]);
            });
        };
    }

    document.getElementById('defaultCertFileInput').onchange = readFileLocally($scope.defaultCert, 'certificateFile', 'certificateFileName');
    document.getElementById('defaultKeyFileInput').onchange = readFileLocally($scope.defaultCert, 'keyFile', 'keyFileName');
    document.getElementById('adminCertFileInput').onchange = readFileLocally($scope.adminCert, 'certificateFile', 'certificateFileName');
    document.getElementById('adminKeyFileInput').onchange = readFileLocally($scope.adminCert, 'keyFile', 'keyFileName');

    $scope.setDefaultCert = function () {
        $scope.defaultCert.busy = true;
        $scope.defaultCert.error = null;
        $scope.defaultCert.success = false;

        Client.setCertificate($scope.defaultCert.certificateFile, $scope.defaultCert.keyFile, function (error) {
            if (error) {
                $scope.defaultCert.error = error.message;
            } else {
                $scope.defaultCert.success = true;
                $scope.defaultCert.certificateFileName = '';
                $scope.defaultCert.keyFileName = '';
            }

            $scope.defaultCert.busy = false;
        });
    };

    $scope.setAdminCert = function () {
        $scope.adminCert.busy = true;
        $scope.adminCert.error = null;
        $scope.adminCert.success = false;

        Client.setAdminCertificate($scope.adminCert.certificateFile, $scope.adminCert.keyFile, function (error) {
            if (error) {
                $scope.adminCert.error = error.message;
            } else {
                $scope.adminCert.success = true;
                $scope.adminCert.certificateFileName = '';
                $scope.adminCert.keyFileName = '';
            }

            $scope.adminCert.busy = false;

            // attempt to reload to make the browser get the new certs
            window.location.reload(true);
        });
    };

    $scope.setDnsCredentials = function () {
        $scope.dnsCredentials.busy = true;
        $scope.dnsCredentials.error = null;
        $scope.dnsCredentials.success = false;

        var data = {
            provider: $scope.dnsCredentials.provider,
            accessKeyId: $scope.dnsCredentials.accessKeyId,
            secretAccessKey: $scope.dnsCredentials.secretAccessKey
        };

        Client.setDnsConfig(data, function (error) {
            if (error) {
                $scope.dnsCredentials.error = error.message;
            } else {
                $scope.dnsCredentials.success = true;

                $scope.dnsConfig.accessKeyId = $scope.dnsCredentials.accessKeyId;
                $scope.dnsConfig.secretAccessKey = $scope.dnsCredentials.secretAccessKey;

                $('#dnsCredentialsModal').modal('hide');

                dnsCredentialsReset();
            }

            $scope.dnsCredentials.busy = false;
        });
    };

    function dnsCredentialsReset() {
        $scope.dnsCredentials.busy = false;
        $scope.dnsCredentials.success = false;
        $scope.dnsCredentials.error = null;

        $scope.dnsCredentials.accessKeyId = '';
        $scope.dnsCredentials.secretAccessKey = '';

        $scope.dnsCredentialsForm.$setPristine();
        $scope.dnsCredentialsForm.$setUntouched();

        $('#dnsCredentialsAccessKeyId').focus();
    }

    $scope.showChangeDnsCredentials = function () {
        dnsCredentialsReset();

        $scope.dnsCredentials.accessKeyId = $scope.dnsConfig.accessKeyId;

        $('#dnsCredentialsModal').modal('show');
    };

    Client.onReady(function () {
        Client.getDnsConfig(function (error, result) {
            if (error) return console.error(error);

            $scope.dnsConfig = result;
        });
    });

    // setup all the dialog focus handling
    ['dnsCredentialsModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
