'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', '$timeout', 'Client', 'AppStore', function ($scope, $location, $timeout, Client, AppStore) {
    $scope.ready = false;
    $scope.apps = [];
    $scope.config = Client.getConfig();
    $scope.user = Client.getUserInfo();

    $scope.appInstall = {
        busy: false,
        installFormVisible: false,
        error: {},
        app: {},
        location: '',
        portBindings: {},
        accessRestriction: '',
        mediaLinks: []
    };

    $scope.reset = function() {
        $scope.appInstall.app = {};
        $scope.appInstall.error = {};
        $scope.appInstall.location = '';
        $scope.appInstall.portBindings = {};
        $scope.appInstall.accessRestriction = '';
        $scope.appInstall.installFormVisible = false;
        $scope.appInstall.mediaLinks = [];
        $('#collapseInstallForm').collapse('hide');
        $('#collapseMediaLinksCarousel').collapse('show');

        $scope.appInstallForm.$setPristine();
        $scope.appInstallForm.$setUntouched();
    };

    $scope.showInstallForm = function () {
        $scope.appInstall.installFormVisible = true;
        $('#collapseMediaLinksCarousel').collapse('hide');
        $('#collapseInstallForm').collapse('show');
        $('#appInstallLocationInput').focus();
    };

    $scope.showInstall = function (app) {
        $scope.reset();

        // make a copy to work with in case the app object gets updated while polling
        angular.copy(app, $scope.appInstall.app);
        $('#appInstallModal').modal('show');

        $scope.appInstall.mediaLinks = $scope.appInstall.app.manifest.mediaLinks || [];
        $scope.appInstall.location = app.location;
        $scope.appInstall.portBindingsInfo = $scope.appInstall.app.manifest.tcpPorts || {};   // Portbinding map only for information
        $scope.appInstall.portBindings = {};                            // This is the actual model holding the env:port pair
        $scope.appInstall.portBindingsEnabled = {};                     // This is the actual model holding the enabled/disabled flag
        $scope.appInstall.accessRestriction = app.accessRestriction || '';

        // set default ports
        for (var env in $scope.appInstall.app.manifest.tcpPorts) {
            $scope.appInstall.portBindings[env] = $scope.appInstall.app.manifest.tcpPorts[env].defaultValue || 0;
            $scope.appInstall.portBindingsEnabled[env] = true;
        }


    };

    $scope.doInstall = function () {
        $scope.appInstall.busy = true;
        $scope.appInstall.error.other = null;
        $scope.appInstall.error.location = null;
        $scope.appInstall.error.port = null;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appInstall.portBindings) {
            if ($scope.appInstall.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appInstall.portBindings[env];
            }
        }

        Client.installApp($scope.appInstall.app.id, $scope.appInstall.app.manifest, $scope.appInstall.app.title, { location: $scope.appInstall.location || '', portBindings: finalPortBindings, accessRestriction: $scope.appInstall.accessRestriction }, function (error) {
            if (error) {
                if (error.statusCode === 409 && (error.message.indexOf('is reserved') !== -1 || error.message.indexOf('is already in use') !== -1)) {
                    $scope.appInstall.error.port = error.message;
                } else if (error.statusCode === 409) {
                    $scope.appInstall.error.location = 'This name is already taken.';
                    $scope.appInstallForm.location.$setPristine();
                    $('#appInstallLocationInput').focus();
                } else if (error.statusCode === 402) {
                    $scope.appInstall.error.other = 'Unable to purchase this app<br/>Please make sure your payment is setup <a href="' + $scope.config.webServerOrigin + '/console.html#/userprofile" target="_blank">here</a>';
                } else {
                    $scope.appInstall.error.other = error.message;
                }

                $scope.appInstall.busy = false;
                return;
            }

            $scope.appInstall.busy = false;

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
