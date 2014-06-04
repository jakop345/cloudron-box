'use strict';

var MyAppsController = function ($scope, $http, $location, Config) {
    console.debug('MyAppsController');

    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADED;
    $scope.loadError = '';

    $scope.refresh = function () {
        $scope.loadStatus = $scope.LOADING;

        $http.get('/api/v1/apps')
            .success(function (data, status, headers) {
                console.log(data);
                data.apps.forEach(function (app) { app.iconUrl = Config.APPSTORE_URL + "/api/v1/app/" + app.id + "/icon"; });
                $scope.apps = data.apps;
                $scope.loadStatus = $scope.LOADED;
            }).error(function (data, status, headers) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = status + '';
                console.log('error in getting app list', data, status);
            });
    };

    $scope.removeApp = function (appId) {
        console.log('Will remove ', appId);
        $http.post('/api/v1/app/' + appId + '/uninstall')
            .success(function (data, status, headers) {
                console.log(data);
                $scope.refresh();
            }).error(function (data, status, headers) {
                console.log('Could not uninstall!', data, status);
            });
    };

    $scope.refresh();
};
