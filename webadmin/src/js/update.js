'use strict';

// create main application module
var app = angular.module('Application', []);

app.controller('Controller', ['$scope', '$http', '$interval', function ($scope, $http, $interval) {
    $scope.title = 'Update in progress...';
    $scope.percent = 0;
    $scope.message = '';
    $scope.error = false;

    $scope.loadWebadmin = function () {
        window.location.href = '/';
    };

    function fetchProgress() {
        $http.get('/api/v1/cloudron/progress').success(function(data, status) {
            if (status === 404) return; // just wait until we create the progress.json on the server side
            if (status !== 200 || typeof data !== 'object') return console.error(status, data);
            if (data.update === null) return $scope.loadWebadmin();

            if (data.update.percent === -1) {
                $scope.title = 'Update Error';
                $scope.error = true;
                $scope.message = data.update.message;
            } else {
                $scope.percent = data.update.percent;
                $scope.message = data.update.message;
            }
        }).error(function (data, status) {
            console.error(status, data);
        });
    }

    $interval(fetchProgress, 2000);

    fetchProgress();
}]);
