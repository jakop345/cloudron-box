'use strict';

var MyAppsController = function ($scope, $http, $location, Client) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADED;
    $scope.loadError = '';

    $scope.refresh = function () {
        $scope.loadStatus = $scope.LOADING;

        Client.getApps(function (error, apps) {
            if (error) {
                console.log(error);
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = status + '';
            } else {
                apps.forEach(function (app) {
                    app.iconUrl = Client.getConfig().appstoreOrigin + '/api/v1/app/' + app.id + '/icon';
                    app.url = 'https://' + app.location + '.' + Client.getConfig().fqdn;
                });
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

    $scope.refresh();
};
