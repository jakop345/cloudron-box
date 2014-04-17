'use strict';

var SettingsController = function ($scope, Client) {
    console.debug('SettingsController');

    $scope.user = Client.getUserInfo();

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };
};
