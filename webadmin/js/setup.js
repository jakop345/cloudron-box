/* exported SetupController */

'use strict';

// create main application module
var app = angular.module('Application', ['ngAnimate', 'angular-md5']);

var SetupController = function ($scope, Client) {
    $scope.initialized = false;
    $scope.busy = false;

    $scope.username = '';
    $scope.email = '';
    $scope.password = '';
    $scope.passwordRepeat = '';

    $scope.error = '';

    $scope.submit = function () {
        $scope.busy = true;
        $scope.error = '';

        Client.createAdmin($scope.username, $scope.password, $scope.email, function (error) {
            if (error) {
                $scope.error = error.message;
                console.error('Internal error', error);

                $scope.busy = false;
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

        // hack for autofocus with angular
        setTimeout( function () { $('input[autofocus]:visible:first').focus(); }, 0);
    });
};
