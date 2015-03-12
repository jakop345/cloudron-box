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
        password: '',
        manifest: {},
        portBindings: {}
    };

    $scope.reset = function () {
        $scope.appconfigure.error = {};
        $scope.appconfigure.app = {};
        $scope.appconfigure.location = '';
        $scope.appconfigure.password = '';
        $scope.appconfigure.portBindings = {};
        $scope.appconfigure.accessRestriction = '';

        $scope.config_form.$setPristine();
        $scope.config_form.$setUntouched();

        $scope.appuninstall.app = {};
        $scope.appuninstall.error = {};
        $scope.appuninstall.password = '';
        $scope.appuninstall.manifest = {};
        $scope.appuninstall.portBindings = {};

        $scope.uninstall_form.$setPristine();
        $scope.uninstall_form.$setUntouched();
    };

    $scope.showConfigure = function (app) {
        $scope.reset();

        $scope.appconfigure.app = app;
        $scope.appconfigure.location = app.location;
        $scope.appconfigure.portBindings = app.manifest.tcpPorts;
        $scope.appconfigure.accessRestriction = app.accessRestriction;

        $('#appConfigureModal').modal('show');
    };

    $scope.doConfigure = function () {
        $scope.appconfigure.busy = true;
        $scope.appconfigure.error.name = null;
        $scope.appconfigure.error.password = null;

        var portBindings = { };
        for (var env in $scope.appconfigure.portBindings) {
            portBindings[env] = $scope.appconfigure.portBindings[env].hostPort;
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

            $('#appConfigureModal').modal('hide');

            $scope.reset();
        });
    };

    $scope.showUninstall = function (app) {
        $scope.reset();

        $scope.appuninstall.app = app;

        $('#appUninstallModal').modal('show');
    };

    $scope.doUninstall = function () {
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

            $('#appUninstallModal').modal('hide');

            $scope.reset();
        });
    };

    $scope.showUpdate = function (app) {
        $scope.appupdate.app = app;
        $scope.appupdate.error.password = null;

        AppStore.getManifest(app.appStoreId, function (error, manifest) {
            if (error) return console.error(error);

            $scope.appupdate.manifest = manifest;
            $scope.appupdate.portBindings = app.portBindings;

            // detect new portbindings
            $scope.appupdate.newPortBindings = null;
            for (var elem in $scope.appupdate.manifest.tcpPorts) {
                if ($scope.appupdate.app.portBindings[elem]) continue;
                if (!$scope.appupdate.newPortBindings) $scope.appupdate.newPortBindings = {};
                $scope.appupdate.newPortBindings[elem] = $scope.appupdate.manifest.tcpPorts[elem];
            }

            // detect obsolete portbindings
            $scope.appupdate.obsoletePortBindings = null;
            for (elem in $scope.appupdate.app.portBindings) {
                if ($scope.appupdate.manifest.tcpPorts[elem]) continue;
                if (!$scope.appupdate.obsoletePortBindings) $scope.appupdate.obsoletePortBindings = {};
                $scope.appupdate.obsoletePortBindings[elem] = $scope.appupdate.app.portBindings[elem];
            }

            $('#appUpdateModal').modal('show');
        });
    };

    $scope.doUpdate = function (form) {
        $scope.appupdate.error.password = null;

        Client.updateApp($scope.appupdate.app.id, $scope.appupdate.manifest, $scope.appupdate.portBindings, $scope.appupdate.password, function (error) {
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

    // setup all the dialog focus handling
    ['appConfigureModal', 'appUninstallModal', 'appUpdateModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
