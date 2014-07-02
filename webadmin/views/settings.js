'use strict';

var SettingsController = function ($scope, Client) {
    $scope.user = Client.getUserInfo();
    $scope.nakedDomain = '';

    Client.getNakedDomain(function (error, appid) {
        if (error) return console.error(error);

        $scope.nakedDomain = appid;
    });

    $scope.setNakedDomain = function () {
        Client.setNakedDomain($scope.nakedDomain, function (error) {
            if (error) return console.error('Error setting naked domain', error);

            console.log('Updated naked domain');
        });
    };

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };
};
