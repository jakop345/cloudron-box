'use strict';

var MainTabViewController = function ($scope, Client) {
    console.debug('MainTabViewController');

    $scope.tabs = [];

    $scope.tabs.push({ title: 'Volumes', templateUrl: './partials/volumelist.html' });
    if (Client.isAdmin()) {
        $scope.tabs.push({ title: 'Users', templateUrl: './partials/userlist.html' });
        // $scope.tabs.push({ title: 'Logs', templateUrl: './partials/logs.html' });
    }
    $scope.tabs.push({ title: 'Settings', templateUrl: './partials/settings.html' });
};