'use strict';

// create main application module
var app = angular.module('Application', []);

app.controller('Controller', ['$scope', '$http', '$interval', function ($scope, $http, $interval) {
    var apiOrigin = '';

    function loadWebadmin() {
        window.location.href = '/';
    }

    function fetchProgress() {
        $http.get(apiOrigin + '/api/v1/cloudron/progress').success(function(data, status) {
            if (status === 404) return; // just wait until we create the progress.json on the server side
            if (status !== 200 || typeof data !== 'object') return console.error(status, data);
            if (data.update === null) return loadWebadmin();

            $('#updateProgressBar').css('width', data.update.percent + '%');
            $('#updateProgressMessage').html(data.update.message);
        }).error(function (data, status) {
            console.error(status, data);
        });
    }

    $interval(fetchProgress, 2000);

    fetchProgress();
}]);
