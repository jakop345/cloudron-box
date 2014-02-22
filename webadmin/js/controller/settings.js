'use strict';

var SettingsController = function ($scope, client) {
    console.debug('SettingsController');

    $scope.user = client.getUserInfo();
    $scope.showWindowOnStartup = localStorage.showWindowOnStartup === 'true';
    $scope.showDevToolsOnStartup = localStorage.showDevToolsOnStartup === 'true';

    $scope.logout = function () {
        localStorage.removeItem('token');
        client.setToken(null);
        window.location.href = '#/';
    };

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };

    $scope.onShowWindowCheckbox = function () {
        localStorage.showWindowOnStartup = $scope.showWindowOnStartup;
    };

    $scope.onShowDevToolsCheckbox = function () {
        localStorage.showDevToolsOnStartup = $scope.showDevToolsOnStartup;
    };
};
