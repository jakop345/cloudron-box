/* exported SetupController */

'use strict';

var SetupController = function ($scope, Client) {
    $scope.initialized = false;
    $scope.disabled = false;

    $scope.username = '';
    $scope.password = '';
    $scope.passwordRepeat = '';
    // TODO do we really need this?
    $scope.email = 'xx@xx.xx';

    $scope.error = {};

    $scope.submit = function () {
        $scope.error.name = null;
        $scope.error.password = null;
        $scope.error.passwordRepeat = null;

        if (!$scope.username) {
            $scope.error.name = 'Username must not be empty';
            $scope.error.password = '';
            $scope.error.passwordRepeat = '';
            return;
        }

        if ($scope.password !== $scope.passwordRepeat) {
            $scope.error.name = '';
            $scope.error.passwordRepeat = 'Passwords do not match';
            $scope.passwordRepeat = '';
            return;
        }

        $scope.disabled = true;
        Client.createAdmin($scope.username, $scope.password, $scope.email, function (error) {
            if (error) {
                if (error.statusCode === 409) {
                    $scope.error.name = 'Username already exists';
                    $scope.disabled = false;
                }
                return;
            }

            window.location.href = '/';
        });
    };

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) return;

        if (!isFirstTime) {
            window.location.href = '/';
            return;
        }

        $scope.initialized = true;
    });
};
