'use strict';

var MainController = function ($scope, Client) {
    console.debug('MainController');

    $scope.$watch(function () {
        var userInfo = Client.getUserInfo();
        $scope.showSideBar = !!userInfo;
        $scope.username = userInfo.username;
    });

    $scope.showSettings = function () {
        window.location.href = '#/settings';
    };

    $scope.logout = function () {
        // TODO actually perform logout on the server
        Client.logout();
        window.location.href = '#/';
    };

    Client.tokenLogin(localStorage.token, function (error, result) {
        if (error) {
            window.location.href = '#/';
            return;
        }

        $scope.showSideBar = !!Client._userInfo;

        // $scope.tabs.push({ title: 'Volumes', templateUrl: './partials/volumelist.html' });
        // if (Client.isAdmin()) {
        //     $scope.tabs.push({ title: 'Users', templateUrl: './partials/userlist.html' });
        //     // $scope.tabs.push({ title: 'Logs', templateUrl: './partials/logs.html' });
        // }
        // $scope.tabs.push({ title: 'Settings', templateUrl: './partials/settings.html' });
    });
};
