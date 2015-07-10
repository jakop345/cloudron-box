'use strict';

// create main application module
var app = angular.module('Application', []);

app.controller('ErrorController', ['$scope', '$http', function ($scope, $http) {
    $scope.webServerOriginLink = '/';
    $scope.errorMessage = '';

    // try to fetch at least config.json to get appstore url
    $http.get('config.json').success(function(data, status) {
        if (status !== 200 || typeof data !== 'object') return console.error(status, data);
        $scope.webServerOriginLink = data.webServerOrigin + '/console.html';
    }).error(function (data, status) {
        if (status === 404) console.error('No config.json found');
        else console.error(status, data);
    });

    var search = window.location.search.slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});

    $scope.errorCode = search.errorCode || 0;
    $scope.errorContext = search.errorContext || '';
}]);
