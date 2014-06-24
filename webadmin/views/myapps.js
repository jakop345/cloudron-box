'use strict';

var MyAppsController = function ($scope, $http, $location, Client) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADED;
    $scope.loadError = '';

    $scope.refresh = function () {
        $scope.loadStatus = $scope.LOADING;

        $http.get('/api/v1/apps')
            .success(function (data, status, headers) {
                data.apps.forEach(function (app) {
                    app.iconUrl = Client.getConfig().appstoreOrigin + '/api/v1/app/' + app.id + '/icon';
                    app.url = 'https://' + app.location + '.' + window.location.hostname;
                });
                $scope.apps = data.apps;
                $scope.loadStatus = $scope.LOADED;
            }).error(function (data, status, headers) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = status + '';
                console.error('error in getting app list', data, status);
            });
    };

    $scope.removeApp = function (appId) {
        $http.post('/api/v1/app/' + appId + '/uninstall')
            .success(function (data, status, headers) {
                $scope.refresh();
            }).error(function (data, status, headers) {
                console.error('Could not uninstall', data, status);
            });
    };

    $scope.refresh();
};
