'use strict';

var AppListController = function ($scope, $http, $location, config) {
    console.debug('AppListController');

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
        $location.path('/app/' + appId + '/configure');
    };

    $scope.refresh();
};
