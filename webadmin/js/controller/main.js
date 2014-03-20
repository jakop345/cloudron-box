'use strict';

var MainController = function ($scope, Client) {
    console.debug('MainController');

    $scope.showVolumeList = function () {
        window.location.href = '#/volumelist';
    };

    $scope.showUserList = function () {
        window.location.href = '#/userlist';
    };

    $scope.showSettings = function () {
        window.location.href = '#/settings';
    };

    Client.tokenLogin(localStorage.token, function (error, result) {
        if (error) {
            window.location.href = '#/';
            return;
        }

        // $scope.tabs.push({ title: 'Volumes', templateUrl: './partials/volumelist.html' });
        // if (Client.isAdmin()) {
        //     $scope.tabs.push({ title: 'Users', templateUrl: './partials/userlist.html' });
        //     // $scope.tabs.push({ title: 'Logs', templateUrl: './partials/logs.html' });
        // }
        // $scope.tabs.push({ title: 'Settings', templateUrl: './partials/settings.html' });
    });
};
