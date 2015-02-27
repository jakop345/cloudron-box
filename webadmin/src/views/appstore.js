'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', '$timeout', 'Client', 'AppStore', function ($scope, $location, $timeout, Client, AppStore) {
    if (!Client.getUserInfo().admin) $location.path('/');

    $scope.ready = false;
    $scope.apps = [];
    $scope.config = Client.getConfig();

    $scope.appinstall = {
        busy: false,
        error: {},
        app: {},
        location: '',
        password: '',
        portBindings: {},
        accessRestriction: ''
    };

    $scope.showInstall = function (app) {
        AppStore.getManifest(app.id, function (error, manifest) {
            if (error) return console.error(error);

            // add manifest to app object
            app.manifest = manifest;

            $scope.appinstall.app = app;
            $scope.appinstall.location = app.location;
            $scope.appinstall.portBindings = manifest.tcpPorts;
            $scope.appinstall.accessRestriction = app.accessRestriction;
            for (var port in $scope.appinstall.portBindings) {
                $scope.appinstall.portBindings[port].hostPort = parseInt(port);
            }

            $('#appInstallModal').modal('show');
        });
    };

    $scope.doInstall = function (form) {
        $scope.appinstall.busy = true;
        $scope.appinstall.error.name = null;
        $scope.appinstall.error.password = null;

        var portBindings = { };
        for (var containerPort in $scope.appinstall.portBindings) {
            portBindings[containerPort] = $scope.appinstall.portBindings[containerPort].hostPort;
        }

        Client.installApp($scope.appinstall.app.id, $scope.app.version, $scope.appinstall.password, $scope.appinstall.app.title, { location: $scope.appinstall.location, portBindings: portBindings, accessRestriction: $scope.appinstall.accessRestriction }, function (error) {
            if (error) {
                if (error.statusCode === 409) {
                    $scope.appinstall.error.name = 'Application already exists.';
                } else if (error.statusCode === 403) {
                    $scope.appinstall.error.password = 'Wrong password provided.';
                    $scope.appinstall.password = '';
                } else {
                    $scope.appinstall.error.name = 'App with the name ' + $scope.appinstall.app.name + ' cannot be installed.';
                }

                $scope.appinstall.busy = false;
                return;
            }

            $scope.appinstall.busy = false;
            $scope.appinstall.error = {};
            $scope.appinstall.app = {};
            $scope.appinstall.location = '';
            $scope.appinstall.password = '';
            $scope.appinstall.portBindings = {};
            $scope.appinstall.accessRestriction = '';

            form.$setPristine();
            form.$setUntouched();

            $('#appInstallModal').modal('hide');

            $location.path('/apps');
        });
    };

    function refresh() {
        $scope.ready = false;

        AppStore.getApps(function (error, apps) {
            if (error) {
                console.error(error);
                return $timeout(refresh, 1000);
            }

            $scope.apps = apps;
            $scope.ready = true;
        });
    }

    refresh();
}]);
