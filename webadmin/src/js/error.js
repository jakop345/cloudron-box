'use strict';

// create main application module
var app = angular.module('Application', []);

app.controller('ErrorController', ['$scope', '$http', function ($scope, $http) {
    $scope.webServerOriginLink = null;

    $http.get('config.json').success(function(data, status) {
        if (status !== 200 || typeof data !== 'object') return console.error(status, data);
        $scope.webServerOrigin = data.webServerOrigin + '/console.html';
    }).error(function (data, status) {
        console.error(status, data);
    });
}]);
