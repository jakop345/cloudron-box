'use strict';

var SettingsController = function ($scope, Client) {
    console.debug('SettingsController');

    $scope.user = Client.getUserInfo();

    $scope.logout = function () {
        // TODO actually perform logout on the server
        localStorage.removeItem('token');
        Client.setToken(null);
        window.location.href = '#/';
    };

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };
};
