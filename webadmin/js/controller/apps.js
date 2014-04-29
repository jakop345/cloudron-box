'use strict';

var AppsController = function ($scope, $http, config) {
    console.debug('AppsController');

    $scope.refresh = function () {
        $http.get(config.APPSTORE_URL + '/api/v1/apps')
            .success(function (data, status, headers) {
                console.log(data);
                data.apps.forEach(function (app) { app.iconUrl = config.APPSTORE_URL + "/api/v1/app/" + app.id + "/icon"; });
                $scope.apps = data.apps;
            }).error(function (data, status, headers) {
                console.log('error in getting app list');
            });
    };

    $scope.installApp = function (appId) {
        console.log('Will install ', appId);
        $http.post("/api/v1/app/install", { app_id: appId })
            .success(function (data, status, headers) {
                console.log('success installing app');
            }).error(function (data, status, headers) {
                console.log('error installing app');
            });
    };

    $scope.refresh();
};
