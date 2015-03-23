/* global ISTATES:false */

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
        portBindingsEnabled: {},
        portBindingsInfo: {},
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
        $scope.appconfigure.portBindingsInfo = app.manifest.tcpPorts || {}; // Portbinding map only for information
        $scope.appconfigure.portBindings = {};                              // This is the actual model holding the env:port pair
        $scope.appconfigure.portBindingsEnabled = {};                       // This is the actual model holding the enabled/disabled flag

        // fill the portBinding structures. There might be holes in the app.portBindings, which signalizes a disabled port
        for (var env in $scope.appconfigure.portBindingsInfo) {
            if (app.portBindings && app.portBindings[env]) {
                $scope.appconfigure.portBindings[env] = app.portBindings[env];
                $scope.appconfigure.portBindingsEnabled[env] = true;
            } else {
                $scope.appconfigure.portBindings[env] = $scope.appconfigure.portBindingsInfo[env].defaultValue || 0;
                $scope.appconfigure.portBindingsEnabled[env] = false;
            }
        }

        $('#appConfigureModal').modal('show');
    };

    $scope.doConfigure = function () {
        $scope.appconfigure.busy = true;
        $scope.appconfigure.error.name = null;
        $scope.appconfigure.error.password = null;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appconfigure.portBindings) {
            if ($scope.appconfigure.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appconfigure.portBindings[env];
            }
        }

        Client.configureApp($scope.appconfigure.app.id, $scope.appconfigure.password, { location: $scope.appconfigure.location, portBindings: finalPortBindings, accessRestriction: $scope.appconfigure.accessRestriction }, function (error) {
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

            // ensure we always operate on objects here
            app.portBindings = app.portBindings || {};
            app.manifest.tcpPorts = app.manifest.tcpPorts || {};
            manifest.tcpPorts = manifest.tcpPorts || {};

            // Activate below two lines for testing the UI
            // manifest.tcpPorts['TEST_HTTP'] = { defaultValue: 1337, description: 'HTTP server'};
            // app.manifest.tcpPorts['TEST_FOOBAR'] = { defaultValue: 1338, description: 'FOOBAR server'};
            // app.portBindings['TEST_SSH'] = 1339;

            var portBindingsInfo = {};                  // Portbinding map only for information
            var portBindings = {};                      // This is the actual model holding the env:port pair
            var portBindingsEnabled = {};               // This is the actual model holding the enabled/disabled flag
            var obsoletePortBindings = {};              // Info map for obsolete port bindings, this is for display use only and thus not in the model
            var portsChanged = false;
            var env;

            // detect new portbindings and copy all from manifest.tcpPorts
            for (env in manifest.tcpPorts) {
                portBindingsInfo[env] = manifest.tcpPorts[env];
                if (!app.manifest.tcpPorts[env]) {
                    portBindingsInfo[env].isNew = true;
                    portBindingsEnabled[env] = true;

                    // use default integer port value in model
                    portBindings[env] = manifest.tcpPorts[env].defaultValue || 0;

                    portsChanged = true;
                } else {
                    // detect if the port binding was enabled
                    if (app.portBindings[env]) {
                        portBindings[env] = app.portBindings[env];
                        portBindingsEnabled[env] = true;
                    } else {
                        portBindings[env] = manifest.tcpPorts[env].defaultValue || 0;
                        portBindingsEnabled[env] = false;
                    }
                }
            }

            // detect obsolete portbindings (mappings in app.portBindings, but not anymore in manifest.tcpPorts)
            for (env in app.manifest.tcpPorts) {
                // only list the port if it is not in the new manifest and was enabled previously
                if (!manifest.tcpPorts[env] && app.portBindings[env]) {
                    obsoletePortBindings[env] = app.portBindings[env];
                    portsChanged = true;
                }
            }

            // now inject the maps into the $scope, we only show those if ports have changed
            $scope.appupdate.portBindings = portBindings;                 // always inject the model, so it gets used in the actual update call
            $scope.appupdate.portBindingsEnabled = portBindingsEnabled;   // always inject the model, so it gets used in the actual update call

            if (portsChanged) {
                $scope.appupdate.portBindingsInfo = portBindingsInfo;
                $scope.appupdate.obsoletePortBindings = obsoletePortBindings;
            } else {
                $scope.appupdate.portBindingsInfo = {};
                $scope.appupdate.obsoletePortBindings = {};
            }

            $('#appUpdateModal').modal('show');
        });
    };

    $scope.doUpdate = function (form) {
        $scope.appupdate.error.password = null;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appupdate.portBindings) {
            if ($scope.appupdate.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appupdate.portBindings[env];
            }
        }

        Client.updateApp($scope.appupdate.app.id, $scope.appupdate.manifest, finalPortBindings, $scope.appupdate.password, function (error) {
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

angular.module('Application').filter('applicationLink', function() {
    return function(app) {
        if (app.installationState === ISTATES.ISTATE_ERROR || app.installationState === ISTATES.ISTATE_INSTALLED) {
            return 'https://' + app.fqdn;
        } else {
            return '';
        }
    };
});