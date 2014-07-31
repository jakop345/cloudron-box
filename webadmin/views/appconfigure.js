'use strict';

var AppConfigureController = function ($scope, $routeParams, Client, AppStore) {
    $scope.app = { };
    $scope.password = '';
    $scope.location = '';
    $scope.disabled = false;
    $scope.error = { };
    $scope.portBindings = { };

    AppStore.getAppById($routeParams.id, function (error, app) {
        try {
            var manifest = JSON.parse(app.manifestJson);
            $scope.error = error || { };
            if (error) return;
            $scope.portBindings = manifest.tcp_ports;
            // default setting is to map ports as they are in manifest
            for (var port in $scope.portBindings) {
                $scope.portBindings[port].exposeAs = port;
            }
        }
        catch (e) {
        }
    });

    $scope.installApp = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        var portBindings = { };
        for (var port in $scope.portBindings) {
            portBindings[port] = $scope.portBindings[port].exposeAs;
        }

        Client.installApp($routeParams.id, $scope.password, { location: $scope.location, portBindings: portBindings }, function (error) {
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

            window.location.replace('#/myapps');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
};
