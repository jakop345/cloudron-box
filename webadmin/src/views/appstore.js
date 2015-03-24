'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', '$timeout', 'Client', 'AppStore', function ($scope, $location, $timeout, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.ready = false;
    $scope.apps = [];
    $scope.config = Client.getConfig();

    $scope.appinstall = {
        busy: false,
        installFormVisible: false,
        error: {},
        app: {},
        location: '',
        password: '',
        portBindings: {},
        accessRestriction: '',
        mediaLinks: []
    };

    $scope.reset = function() {
        $scope.appinstall.app = {};
        $scope.appinstall.error = {};
        $scope.appinstall.location = '';
        $scope.appinstall.password = '';
        $scope.appinstall.portBindings = {};
        $scope.appinstall.accessRestriction = '';
        $scope.appinstall.installFormVisible = false;
        $scope.appinstall.mediaLinks = [];
        $('#collapseInstallForm').collapse('hide');

        $scope.appInstallForm.$setPristine();
        $scope.appInstallForm.$setUntouched();
    };

    $scope.showInstallForm = function () {
        $scope.appinstall.installFormVisible = true;
        $('#collapseInstallForm').collapse('show');
        $('#appInstallLocationInput').focus();
    };

    $scope.showInstall = function (app) {
        $scope.reset();

        // make a copy to work with in case the app object gets updated while polling
        angular.copy(app, $scope.appinstall.app);
        $('#appInstallModal').modal('show');

        $scope.appinstall.mediaLinks = $scope.appinstall.app.manifest.mediaLinks || [];
        $scope.appinstall.location = app.location;
        $scope.appinstall.portBindingsInfo = $scope.appinstall.app.manifest.tcpPorts || {};   // Portbinding map only for information
        $scope.appinstall.portBindings = {};                            // This is the actual model holding the env:port pair
        $scope.appinstall.portBindingsEnabled = {};                     // This is the actual model holding the enabled/disabled flag
        $scope.appinstall.accessRestriction = app.accessRestriction || '';

        // set default ports
        for (var env in $scope.appinstall.app.manifest.tcpPorts) {
            $scope.appinstall.portBindings[env] = $scope.appinstall.app.manifest.tcpPorts[env].defaultValue || 0;
            $scope.appinstall.portBindingsEnabled[env] = true;
        }
    };

    $scope.doInstall = function () {
        $scope.appinstall.busy = true;
        $scope.appinstall.error.other = null;
        $scope.appinstall.error.location = null;
        $scope.appinstall.error.password = null;
        $scope.appinstall.error.port = null;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appinstall.portBindings) {
            if ($scope.appinstall.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appinstall.portBindings[env];
            }
        }

        Client.installApp($scope.appinstall.app.id, $scope.appinstall.app.manifest, $scope.appinstall.password, $scope.appinstall.app.title, { location: $scope.appinstall.location, portBindings: finalPortBindings, accessRestriction: $scope.appinstall.accessRestriction }, function (error) {
            if (error) {
                if (error.statusCode === 409 && (error.message.indexOf('is reserved') !== -1 || error.message.indexOf('is already in use') !== -1)) {
                    $scope.appinstall.error.port = error.message;
                } else if (error.statusCode === 409) {
                    $scope.appinstall.error.location = 'This name is already taken.';
                    $scope.appInstallForm.location.$setPristine();
                    $('#appInstallLocationInput').focus();
                } else if (error.statusCode === 403) {
                    $scope.appinstall.error.password = 'Wrong password provided.';
                    $scope.appinstall.password = '';
                    $('#appInstallPasswordInput').focus();
                } else {
                    $scope.appinstall.error.other = error.message;
                }

                $scope.appinstall.busy = false;
                return;
            }

            $scope.appinstall.busy = false;

            // wait for dialog to be fully closed to avoid modal behavior breakage when moving to a different view already
            $('#appInstallModal').on('hidden.bs.modal', function () {
                $scope.reset();
                $location.path('/apps');
            });

            $('#appInstallModal').modal('hide');
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

    // setup all the dialog focus handling
    ['appInstallModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
