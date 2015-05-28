'use strict';

angular.module('Application').controller('SettingsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.lastBackup = 'No backups';
    $scope.backups = [];

    $scope.developerModeChange = {
        busy: false,
        error: {},
        password: ''
    };

    $scope.createBackup = {
        busy: false
    };

    function developerModeChangeReset () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.password = '';

        $scope.developerModeChangeForm.$setPristine();
        $scope.developerModeChangeForm.$setUntouched();
    }

    $scope.doChangeDeveloperMode = function () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.busy = true;

        Client.changeDeveloperMode(!$scope.config.developerMode, $scope.developerModeChange.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.developerModeChange.error.password = true;
                    $scope.developerModeChange.password = '';
                    $('#inputDeveloperModeChangePassword').focus();
                } else {
                    console.error('Unable to change developer mode.', error);
                }
            } else {
                developerModeChangeReset();

                $('#developerModeChangeModal').modal('hide');
            }

            $scope.developerModeChange.busy = false;
        });
    };

    $scope.doCreateBackup = function () {
        $scope.$parent.initialized = false;
        $scope.createBackup.busy = true;

        Client.backup(function (error) {
            if (error) console.error(error);

            $('#createBackupModal').modal('hide');
            $scope.createBackup.busy = false;

            $('#backupProgressModal').modal('show');

            // TODO this does look like we should use progress.json?
            // now start query
            function checkIfDone() {
                Client.version(function (error) {
                    if (error) return window.setTimeout(checkIfDone, 1000);

                    $('#backupProgressModal').modal('hide');
                    $scope.$parent.initialized = true;
                });
            }

            window.setTimeout(checkIfDone, 5000);
        });
    };


    $scope.showChangeDeveloperMode = function () {
        developerModeChangeReset();

        $('#developerModeChangeModal').modal('show');
    };

    $scope.showCreateBackup = function () {
        $('#createBackupModal').modal('show');
    };

    Client.onReady(function () {
        Client.getBackups(function (error, backups) {
            if (error) return console.error(error);

            $scope.backups = backups;

            if ($scope.backups.length > 0) {
                $scope.lastBackup = backups[0];
            } else {
                $scope.lastBackup = 'No backups';
            }
        });
    });

    // setup all the dialog focus handling
    ['developerModeChangeModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
