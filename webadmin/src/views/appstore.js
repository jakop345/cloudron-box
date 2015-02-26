'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', '$timeout', 'Client', 'AppStore', function ($scope, $location, $timeout, Client, AppStore) {
    if (!Client.getUserInfo().admin) $location.path('/');

    $scope.ready = false;
    $scope.apps = [];

    $scope.installApp = function (app) {
        $location.path('/app/' + app.id + '/install');
    };

    $scope.openApp = function (app) {
        for (var i = 0; i < Client._installedApps.length; i++) {
            if (Client._installedApps[i].appStoreId === app.id) {
                window.open('https://' + Client._installedApps[i].fqdn);
                break;
            }
        }
    };

    function refresh() {
        $scope.ready = false;

        AppStore.getApps(function (error, apps) {
            if (error) {
                console.error(error);
                return $timeout(refresh, 1000);
            }

            $scope.apps = apps;
            $scope.ready = true;
        });
    }

    refresh();
}]);
