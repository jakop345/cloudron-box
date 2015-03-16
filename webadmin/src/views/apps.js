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
            // manifest.tcpPorts['TEST_HTTP'] = { defaultValue: 1337, description: 'HTTP server'};
            // app.portBindings['TEST_SSH'] = 1337;

            $scope.appupdate.manifest = manifest;

            var portBindingsInfo = {};          // Portbinding map only for information
            var portBindings = {};              // This is the actual model holding the env:port pair
            var obsoletePortBindings = {};      // Info map for obsolete port bindings, this is for display use only and thus not in the model
            var newPorts = false;

            // detect new portbindings and copy all from manifest.tcpPorts
            for (var env in manifest.tcpPorts) {
                portBindingsInfo[env] = manifest.tcpPorts[env];
                if (!app.portBindings[env]) {
                    portBindingsInfo[env].isNew = true;

                    // use default integer port value in model
                    portBindings[env] = manifest.tcpPorts[env].defaultValue || 0;

                    newPorts = true;
                } else {
                    // just copy the integer port value into model
                    portBindings[env] = app.portBindings[env];
                }
            }

            // detect obsolete portbindings (mappings in app.portBindings, but not anymore in manifest.tcpPorts)
            for (env in app.portBindings) {
                if (!manifest.tcpPorts[env]) {
                    obsoletePortBindings[env] = app.portBindings[env];
                }
            }

            // now inject the maps into the $scope, we only show those if ports have changed
            if (newPorts) {
                $scope.appupdate.portBindingsInfo = portBindingsInfo;
                $scope.appupdate.portBindings = portBindings;
            } else {
                $scope.appupdate.portBindingsInfo = {};
                $scope.appupdate.portBindings = {};
            }

            $scope.appupdate.obsoletePortBindings = obsoletePortBindings;

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
