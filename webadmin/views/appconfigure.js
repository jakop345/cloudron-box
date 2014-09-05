'use strict';

var AppConfigureController = function ($scope, $routeParams, Client, AppStore) {
    $scope.app = null;
    $scope.password = '';
    $scope.location = '';
    $scope.disabled = false;
    $scope.error = { };
    $scope.portBindings = { };

    Client.getApp($routeParams.appId, function (error, app) {
        $scope.error = error || { };
        if (error) return;

        $scope.app = app;
        $scope.location = app.location;
        $scope.portBindings = app.manifest.tcpPorts;
        for (var containerPort in $scope.portBindings) {
            $scope.portBindings[containerPort].hostPort = app.portBindings[containerPort];
        }
    });

    $scope.configureApp = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        var portBindings = { };
        for (var containerPort in $scope.portBindings) {
            portBindings[containerPort] = $scope.portBindings[containerPort].hostPort;
        }

        Client.configureApp($routeParams.appId, $scope.password, { location: $scope.location, portBindings: portBindings }, function (error) {
            if (error) {
                console.error('Unable to configure app.', error);
                if (error.statusCode === 403) {
                    $scope.error.password = 'Wrong password provided.';
                    $scope.app.password = '';
                } else {
                    $scope.error.name = 'App with the name ' + $scope.app.name + ' cannot be configured.';
                }

                $scope.disabled = false;
                return;
            }

            window.location.replace('#/app/' + $routeParams.appId + '/details');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };

    document.getElementById('inputLocation').focus();
};
