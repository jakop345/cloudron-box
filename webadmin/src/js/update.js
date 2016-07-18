'use strict';

// create main application module
var app = angular.module('Application', []);

app.controller('Controller', ['$scope', '$http', '$interval', function ($scope, $http, $interval) {
    $scope.title = '';
    $scope.percent = 0;
    $scope.message = '';
    $scope.error = false;

    $scope.loadWebadmin = function () {
        window.location.href = '/';
    };

    function fetchProgress() {
        $http.get('/api/v1/cloudron/progress').success(function(data, status) {
            if (status === 404) return; // just wait until we create the progress.json on the server side
            if (status !== 200 || typeof data !== 'object') return console.error('Invalid response for progress', status, data);
            if (!data.update && !data.migrate) return $scope.loadWebadmin();

            if (data.update) {
                if (data.update.percent === -1) {
                    $scope.title = 'Update Error';
                    $scope.error = true;
                    $scope.message = data.update.message;
                } else {
                    $scope.title = 'Update in progress...';
                    $scope.percent = data.update.percent;
                    $scope.message = data.update.message;
                }
            } else { // migrating
                if (data.migrate.percent === -1) {
                    $scope.title = 'Migration Error';
                    $scope.error = true;
                    $scope.message = data.migrate.message;
                } else {
                    $scope.title = 'Migration in progress...';
                    $scope.percent = data.migrate.percent;
                    $scope.message = data.migrate.message;

                    if (!data.migrate.info) return;

                    // check if the new domain is available via the appstore (cannot use cloudron
                    // directly as we might hit NXDOMAIN)
                    $http.get(data.apiServerOrigin + '/api/v1/boxes/' + data.migrate.info.domain + '/status').success(function(data2, status) {
                        if (status === 200 && data2.status === 'ready') {
                            window.location = 'https://my.' + data.migrate.info.domain;
                        }
                    });
                }
            }
        }).error(function (data, status) {
            console.error('Error getting progress', status, data);
        });
    }

    $interval(fetchProgress, 5000);

    fetchProgress();
}]);
