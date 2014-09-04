'use strict';

var AppInstallController = function ($scope, $routeParams, Client, AppStore) {
    $scope.app = null;
    $scope.password = '';
    $scope.location = '';
    $scope.disabled = false;
    $scope.error = { };
    $scope.portBindings = { };

    AppStore.getAppById($routeParams.appStoreId, function (error, app) {
        $scope.error = error || { };
        if (error) return;
        $scope.app = app;
    });

    AppStore.getManifest($routeParams.appStoreId, function (error, manifest) {
        $scope.error = error || { };
        if (error) return;
        $scope.portBindings = manifest.tcpPorts;
        // default setting is to map ports as they are in manifest
        for (var port in $scope.portBindings) {
            $scope.portBindings[port].hostPort = port;
        }
    });

    $scope.installApp = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        var portBindings = { };
        for (var port in $scope.portBindings) {
            portBindings[port] = $scope.portBindings[port].hostPort;
        }

        Client.installApp($routeParams.appStoreId, $scope.password, { location: $scope.location, portBindings: portBindings }, function (error, appId) {
            if (error) {
                console.error('Unable to install app.', error);
                if (error.statusCode === 409) {
                    $scope.error.name = 'Application already exists.';
                } else if (error.statusCode === 403) {
                    $scope.error.password = 'Wrong password provided.';
                    $scope.app.password = '';
                } else {
                    $scope.error.name = 'App with the name ' + $scope.app.name + ' cannot be installed.';
                }

                $scope.disabled = false;
                return;
            }

            window.location.replace('#/app/' + appId + '/details');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };

    document.getElementById('inputLocation').focus();
};
