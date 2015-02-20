'use strict';

// create main application module
var app = angular.module('Application', ['ngAnimate', 'angular-md5']);

app.controller('SetupController', ['$scope', 'Client', function ($scope, Client) {
    $scope.initialized = false;
    $scope.busy = false;

    $scope.username = '';
    $scope.email = '';
    $scope.password = '';
    $scope.passwordRepeat = '';

    // Stupid angular location provider either wants html5 location mode or not, do the query parsing on my own
    var search = window.location.search.slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});

    $scope.setupToken = search.setupToken;

    $scope.error = '';

    $scope.submit = function () {
        $scope.busy = true;
        $scope.error = '';

        Client.createAdmin($scope.username, $scope.password, $scope.email, $scope.setupToken, function (error) {
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
        if (error) {
            window.location.href = '/error.html';
            return;
        }

        if (!isFirstTime) {
            window.location.href = '/';
            return;
        }

        $scope.initialized = true;

        // hack for autofocus with angular
        setTimeout( function () { $('input[autofocus]:visible:first').focus(); }, 0);
    });
}]);
