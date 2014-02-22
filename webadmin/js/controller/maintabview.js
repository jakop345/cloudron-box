'use strict';

var MainTabViewController = function ($scope, client, syncerManager) {
    console.debug('MainTabViewController');

    $scope.tabs = [];

    $scope.tabs.push({ title: 'Volumes', templateUrl: './partials/volumelist.html' });
    if (client.isAdmin()) {
        $scope.tabs.push({ title: 'Users', templateUrl: './partials/userlist.html' });
        // $scope.tabs.push({ title: 'Logs', templateUrl: './partials/logs.html' });
    }
    $scope.tabs.push({ title: 'Settings', templateUrl: './partials/settings.html' });

    syncerManager.createSyncers(function (error) {
        if (error) {
            console.error('Unable to init syncers.', error);
            return;
        }
    });
};