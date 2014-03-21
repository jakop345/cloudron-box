'use strict';

var MainController = function ($scope, $route, Client) {
    console.debug('MainController');

    $scope.isActive = function (url) {
        if (!$route.current) return false;
        return $route.current.$$route.originalPath.indexOf(url) === 0;
    };

    $scope.href = function ($event, url) {
        $event.preventDefault();
        window.location.href = url;
    };

    $scope.$watch(function () {
        var userInfo = Client.getUserInfo();
        $scope.showSideBar = !!userInfo;
        $scope.username = userInfo ? userInfo.username : null;
    });

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
    });
};
