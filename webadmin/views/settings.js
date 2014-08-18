'use strict';

/* global $:true */

var SettingsController = function ($scope, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.nakedDomainApp = null;
    $scope.drives = [];

    $scope.setNakedDomain = function () {
        var appid = $scope.nakedDomainApp ? $scope.nakedDomainApp.id : null;

        Client.setNakedDomain(appid, function (error) {
            if (error) return console.error('Error setting naked domain', error);
            console.debug('Updated naked domain');
        });
    };

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };

    $scope.update = function () {
        $('#updateModal').modal('hide');

        Client.update(function (error) {
            if (error) console.error(error);
        });
    };

    Client.getApps(function (error, apps) {
        if (error) console.error('Error loading app list');
        $scope.apps = apps;

        console.debug('Apps:', $scope.apps);

        Client.getNakedDomain(function (error, appid) {
            if (error) return console.error(error);

            for (var i = 0; i < $scope.apps.length; i++) {
                if ($scope.apps[i].id === appid) {
                    $scope.nakedDomainApp = $scope.apps[i];
                    break;
                }
            }
        });

        Client.stats(function (error, stats) {
            if (error) return console.error(error);
            $scope.drives = stats.drives;
        });
    });
};
