'use strict';

var AppListController = function ($scope, $location, AppStore) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADED;
    $scope.loadError = '';

    $scope.refresh = function () {
        $scope.loadStatus = $scope.LOADING;

        AppStore.getApps(function (error, apps) {
            if (error) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = error.message;
                console.error(error);
                return;
            }

            $scope.apps = apps;
            $scope.loadStatus = $scope.LOADED;
        });
    };

    $scope.installApp = function (appId) {
        $location.path('/app/' + appId + '/configure');
    };

    $scope.refresh();
};
