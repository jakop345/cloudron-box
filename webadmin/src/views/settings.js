'use strict';

angular.module('Application').controller('SettingsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.lastBackup = null;
    $scope.backups = [];

    $scope.developerModeChange = {
        busy: false,
        error: {},
        password: ''
    };

    $scope.createBackup = {
        busy: false
    };

    $scope.nameChange = {
        busy: false,
        error: {},
        name: ''
    };

    function nameChangeReset() {
        $scope.nameChange.error.name = null;
        $scope.nameChange.name = '';

        $scope.nameChangeForm.$setPristine();
        $scope.nameChangeForm.$setUntouched();
    }

    function fetchBackups() {
        Client.getBackups(function (error, backups) {
            if (error) return console.error(error);

            $scope.backups = backups;

            if ($scope.backups.length > 0) {
                $scope.lastBackup = backups[0];
            } else {
                $scope.lastBackup = null;
            }
        });
    }

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

    $scope.doChangeName = function () {
        $scope.nameChange.error.name = null;
        $scope.nameChange.busy = true;

        Client.changeCloudronName($scope.nameChange.name, function (error) {
            if (error) {
                console.error('Unable to change developer mode.', error);
            } else {
                nameChangeReset();
                $('#nameChangeModal').modal('hide');
            }

            $scope.nameChange.busy = false;
        });
    };

    $scope.doCreateBackup = function () {
        $('#createBackupModal').modal('hide');
        $scope.createBackup.busy = true;
        $scope.createBackup.percent = 100;

        Client.backup(function (error) {
            if (error) {
                console.error(error);
                $scope.createBackup.busy = false;
            }

            function checkIfDone() {
                Client.progress(function (error, data) {
                    if (error) return window.setTimeout(checkIfDone, 250);

                    // check if we are done
                    if (!data.backup || data.backup.percent >= 100) {
                        fetchBackups();
                        $scope.createBackup.busy = false;
                        return;
                    }

                    $scope.createBackup.percent = data.backup.percent;
                    window.setTimeout(checkIfDone, 250);
                });
            }

            checkIfDone();
        });
    };

    $scope.showChangeDeveloperMode = function () {
        developerModeChangeReset();
        $('#developerModeChangeModal').modal('show');
    };

    $scope.showChangeName = function () {
        nameChangeReset();
        $('#nameChangeModal').modal('show');
    };

    $scope.showCreateBackup = function () {
        $('#createBackupModal').modal('show');
    };

    Client.onReady(function () {
        fetchBackups();
    });

    // setup all the dialog focus handling
    ['developerModeChangeModal', 'nameChangeModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
