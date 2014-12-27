/* exported SetupController */
/* global angular:false */

'use strict';

// create main application module
var app = angular.module('Application', ['ngAnimate', 'angular-md5']);

var SetupController = function ($scope, Client) {
    $scope.initialized = false;
    $scope.busy = false;
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
        $scope.busy = true;

        if (!$scope.username) {
            $scope.busy = false;
            $scope.error.username = 'Username must not be empty';
            return;
        }

        if (!$scope.email) {
            $scope.busy = false;
            $scope.error.email = 'Email must not be empty';
            return;
        }

        if ($scope.password !== $scope.passwordRepeat) {
            $scope.busy = false;
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
        setTimeout( function () { $('input[autofocus]:visible:first').focus() }, 0);
    });
};
