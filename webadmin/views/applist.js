'use strict';

var AppListController = function ($scope, $location, Client, AppStore) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADED;
    $scope.loadError = '';

    $scope.apps = [];

    $scope.refresh = function () {
        $scope.loadStatus = $scope.LOADING;

        AppStore.getApps(function (error, apps) {
            if (error) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = error.message;
                console.error(error);
                return;
            }

            // make an Array out of the apps Object
            while ($scope.apps.length > 0) $scope.apps.pop();
            for (var app in apps) $scope.apps.push(apps[app]);

            $scope.loadStatus = $scope.LOADED;
        });
    };

    $scope.installApp = function (appId) {
        $location.path('/app/' + appId + '/install');
    };

    Client.onConfig(function (config) {
        if (!config.appServerUrl) return;
        $scope.refresh();
    });
};
