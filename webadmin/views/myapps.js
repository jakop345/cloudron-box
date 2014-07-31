'use strict';

var MyAppsController = function ($scope, $http, $location, $interval, Client) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADING;
    $scope.loadError = '';

    $scope.refresh = function () {
        Client.getApps(function (error, apps) {
            if (error) {
                console.log(error);
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = status + '';
            } else {
                $scope.apps = apps;
                $scope.loadStatus = $scope.LOADED;
            }
        });
    };

    $scope.removeApp = function (appId) {
        Client.removeApp(appId, function (error) {
            if (error) console.log(error);
            $scope.refresh();
        });
     };

    var refreshTimer = $interval($scope.refresh, 2000);
    $scope.$on('$destroy', function () {
        $interval.cancel(refreshTimer);
    });

    $scope.refresh();
};
