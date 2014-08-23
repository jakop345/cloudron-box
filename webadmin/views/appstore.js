'use strict';

var AppStoreController = function ($scope, $location, Client, AppStore) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADING;
    $scope.loadError = '';

    $scope.apps = [];

    $scope.refresh = function () {
        Client.refreshInstalledApps(function (error) {
            if (error) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = error.message;
                console.error(error);
                return;
            }

            AppStore.getApps(function (error, apps) {
                if (error) {
                    $scope.loadStatus = $scope.ERROR;
                    $scope.loadError = error.message;
                    console.error(error);
                    return;
                }

                for (var app in apps) {
                    var found = false;
                    for (var i = 0; i < $scope.apps.length; ++i) {
                        if (apps[app].id === $scope.apps[i].id) found = true;
                    }

                    if (!found) $scope.apps.push(apps[app]);
                }

                $scope.apps.forEach(function (app, index) {
                    if (Client._installedApps) app.installed = Client._installedApps.some(function (a) { return a.id === app.id; });
                    if (!apps[app.id]) $scope.splice(index, 1);
                });

                $scope.loadStatus = $scope.LOADED;
            });
        });
    };

    $scope.installApp = function (app) {
        $location.path('/app/' + app.id + '/install');
    };

    $scope.openApp = function (app) {
        window.open('https://' + app.fqdn);
    };

    Client.onConfig(function (config) {
        if (!config.appServerUrl) return;
        $scope.refresh();
    });
};
