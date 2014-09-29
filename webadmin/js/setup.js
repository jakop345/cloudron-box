/* exported SetupController */

'use strict';

var SetupController = function ($scope, Client) {
    $scope.initialized = false;
    $scope.disabled = false;

    $scope.username = '';
    $scope.email = '';
    $scope.password = '';
    $scope.passwordRepeat = '';

    $scope.error = {};

    $scope.submit = function () {
        $scope.error.username = null;
        $scope.error.email = null;
        $scope.error.password = null;
        $scope.error.passwordRepeat = null;

        if (!$scope.username) {
            $scope.error.username = 'Username must not be empty';
            return;
        }

        if (!$scope.email) {
            $scope.error.email = 'Email must not be empty';
            return;
        }

        if ($scope.password !== $scope.passwordRepeat) {
            $scope.error.passwordRepeat = 'Passwords do not match';
            $scope.passwordRepeat = '';
            return;
        }

        $scope.disabled = true;
        Client.createAdmin($scope.username, $scope.password, $scope.email, function (error) {
            if (error) {
                if (error.statusCode === 409) {
                    $scope.error.username = 'Username already exists';
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
