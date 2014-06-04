'use strict';

var AppListController = function ($scope, $http, $location, config) {
    console.debug('AppListController');

    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADED;
    $scope.loadError = '';

    $scope.refresh = function () {
        $scope.loadStatus = $scope.LOADING;

        $http.get(config.APPSTORE_URL + '/api/v1/apps')
            .success(function (data, status, headers) {
                console.log(data);
                data.apps.forEach(function (app) { app.iconUrl = config.APPSTORE_URL + "/api/v1/app/" + app.id + "/icon"; });
                $scope.apps = data.apps;
                $scope.loadStatus = $scope.LOADED;
            }).error(function (data, status, headers) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = status + '';
                console.log('error in getting app list', data, status);
            });
    };

    $scope.installApp = function (appId) {
        console.log('Will install ', appId);
        $location.path('/app/' + appId + '/configure');
    };

    $scope.refresh();
};
