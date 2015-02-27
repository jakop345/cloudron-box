'use strict';

angular.module('Application').controller('AppListController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.installedApps = Client.getInstalledApps();
    $scope.config = Client.getConfig();

    $scope.appconfigure = {
        busy: false,
        error: {},
        app: {},
        location: '',
        password: '',
        portBindings: {},
        accessRestriction: ''
    };

    $scope.showDetails = function (app) {
        $location.path('/app/' + app.id + '/details');
    };

    $scope.showConfigure = function (app) {
        $scope.appconfigure.app = app;
        $scope.appconfigure.location = app.location;
        $scope.appconfigure.portBindings = app.manifest.tcpPorts;
        $scope.appconfigure.accessRestriction = app.accessRestriction;
        for (var containerPort in $scope.appconfigure.portBindings) {
            $scope.appconfigure.portBindings[containerPort].hostPort = app.portBindings[containerPort];
        }

        $('#appConfigureModal').modal('show');
    };

    $scope.doConfigure = function () {

        $scope.appconfigure.busy = true;
        $scope.appconfigure.error.name = null;
        $scope.appconfigure.error.password = null;

        var portBindings = { };
        for (var containerPort in $scope.appconfigure.portBindings) {
            portBindings[containerPort] = $scope.appconfigure.portBindings[containerPort].hostPort;
        }

        Client.configureApp($scope.appconfigure.app.id, $scope.appconfigure.password, { location: $scope.appconfigure.location, portBindings: portBindings, accessRestriction: $scope.appconfigure.accessRestriction }, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.appconfigure.error.password = 'Wrong password provided.';
                    $scope.appconfigure.password = '';
                } else {
                    $scope.appconfigure.error.name = 'App with the name ' + $scope.appconfigure.app.name + ' cannot be configured.';
                }

                $scope.appconfigure.busy = false;
                return;
            }

            $scope.appconfigure.password = '';
            $scope.appconfigure.busy = false;

            $('#appConfigureModal').modal('hide');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}]);
