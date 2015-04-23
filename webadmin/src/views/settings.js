'use strict';

angular.module('Application').controller('SettingsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.developerModeChange = {
        busy: false,
        error: {},
        password: ''
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

    $scope.showChangeDeveloperMode = function () {
        developerModeChangeReset();

        $('#developerModeChangeModal').modal('show');
    };

    Client.onReady(function () {

    });

    // setup all the dialog focus handling
    ['developerModeChangeModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
