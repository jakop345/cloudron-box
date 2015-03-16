'use strict';

angular.module('Application').controller('AppsController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    $scope.HOST_PORT_MIN = 1024;
    $scope.HOST_PORT_MAX = 65535;

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

        $scope.uninstall_form.$setPristine();
        $scope.uninstall_form.$setUntouched();
    };

    $scope.showConfigure = function (app) {
        $scope.reset();

        $scope.appconfigure.app = app;
        $scope.appconfigure.location = app.location;
        $scope.appconfigure.accessRestriction = app.accessRestriction;
        $scope.appconfigure.portBindingsInfo = app.manifest.tcpPorts;         // Portbinding map only for information
        $scope.appconfigure.portBindings = angular.copy(app.portBindings);    // This is the actual model holding the env:port pair

        $('#appConfigureModal').modal('show');
    };

    $scope.doConfigure = function () {
        $scope.appconfigure.busy = true;
        $scope.appconfigure.error.name = null;
        $scope.appconfigure.error.password = null;

        Client.configureApp($scope.appconfigure.app.id, $scope.appconfigure.password, { location: $scope.appconfigure.location, portBindings: $scope.appconfigure.portBindings, accessRestriction: $scope.appconfigure.accessRestriction }, function (error) {
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

            // Activate below two lines for testing the UI
            // manifest.tcpPorts['TEST_HTTP'] = { port: 1337, description: 'HTTP server'};
            // app.portBindings['TEST_SSH'] = { port: 1337, description: 'SSH server'};

            $scope.appupdate.manifest = manifest;
            var portBindings = angular.copy(app.portBindings);
            var portsChanged = false;

            // detect new portbindings
            for (var env in $scope.appupdate.manifest.tcpPorts) {
                portBindings[env] = $scope.appupdate.manifest.tcpPorts[env];
                if (!$scope.appupdate.app.portBindings[env]) {
                    portBindings[env].isNew = true;
                    portsChanged = true;
                }
            }

            // detect obsolete portbindings
            for (env in $scope.appupdate.app.portBindings) {
                if (!$scope.appupdate.manifest.tcpPorts[env]) {
                    portBindings[env].isObsolete = true;
                    portsChanged = true;
                }
            }

            if (portsChanged) $scope.appupdate.portBindings = portBindings;
            else $scope.appupdate.portBindings = {};

            $('#appUpdateModal').modal('show');
        });
    };

    $scope.doUpdate = function (form) {
        $scope.appupdate.error.password = null;

        var portBindings = {};
        for (var env in $scope.appupdate.portBindings) {
            if ($scope.appupdate.portBindings[env].isObsolete) continue;
            portBindings[env] = $scope.appupdate.portBindings[env].hostPort;
        }

        Client.updateApp($scope.appupdate.app.id, $scope.appupdate.manifest, portBindings, $scope.appupdate.password, function (error) {
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
