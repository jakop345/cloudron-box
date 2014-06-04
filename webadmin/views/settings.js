'use strict';

var SettingsController = function ($scope, Client) {
    $scope.user = Client.getUserInfo();

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };
};
