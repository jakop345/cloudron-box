'use strict';

angular.module('Application').controller('AppsController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
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

    $scope.appuninstall = {
        error: {},
        app: {},
        password: ''
    };

    $scope.appupdate = {
        error: {},
        app: {},
        password: ''
    };

    $scope.showConfigure = function (app) {
        $scope.appconfigure.app = app;
        $scope.appconfigure.location = app.location;
        $scope.appconfigure.portBindings = app.manifest.tcpPorts;
        $scope.appconfigure.accessRestriction = app.accessRestriction;

        for (var containerPort in $scope.appconfigure.portBindings) {
            $scope.appconfigure.portBindings[containerPort].hostPort = parseInt($scope.appconfigure.app.portBindings[containerPort]);
        }

        $('#appConfigureModal').modal('show');
    };

    $scope.doConfigure = function (form) {
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

            $scope.appconfigure.busy = false;
            $scope.appconfigure.error = {};
            $scope.appconfigure.app = {};
            $scope.appconfigure.location = '';
            $scope.appconfigure.password = '';
            $scope.appconfigure.portBindings = {};
            $scope.appconfigure.accessRestriction = '';

            form.$setPristine();
            form.$setUntouched();

            $('#appConfigureModal').modal('hide');
        });
    };

    $scope.showUninstall = function (app) {
        $scope.appuninstall.app = app;
        $scope.appuninstall.error.password = null;

        $('#appUninstallModal').modal('show');
    };

    $scope.doUninstall = function (form) {
        $scope.appuninstall.error.password = null;

        Client.uninstallApp($scope.appuninstall.app.id, $scope.appuninstall.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.appuninstall.password = '';
                    $scope.appuninstall.error.password = true;
                } else {
                    console.error(error);
                }
                return;
            }

            $scope.appuninstall.app = {};
            $scope.appuninstall.password = '';

            form.$setPristine();
            form.$setUntouched();

            $('#appUninstallModal').modal('hide');
        });
    };

    $scope.showUpdate = function (app) {
        $scope.appupdate.app = app;
        $scope.appupdate.error.password = null;

        AppStore.getManifest(app.appStoreId, function (error, manifest) {
            if (error) return console.error(error);

            $scope.appupdate.app.manifest = manifest;

            $('#appUpdateModal').modal('show');
        });
    };

    $scope.doUpdate = function (form) {
        $scope.appupdate.error.password = null;

        Client.updateApp($scope.appupdate.app.id, $scope.appupdate.app.manifest, $scope.appupdate.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.appupdate.password = '';
                    $scope.appupdate.error.password = true;
                } else {
                    console.error(error);
                }
                return;
            }

            $scope.appupdate.app = {};
            $scope.appupdate.password = '';

            form.$setPristine();
            form.$setUntouched();

            $('#appUpdateModal').modal('hide');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}]);
