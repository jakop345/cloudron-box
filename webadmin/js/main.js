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
        localStorage.removeItem('token');
        Client.logout();
        window.location.href = '#/login';
    };

    Client.setClientCredentials('cid-webadmin', 'unused');
    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            console.error('Unable to connect.', error);
            return;
        }

        console.debug('Successfully connect to server. Server first time', isFirstTime);

        if (isFirstTime) {
            window.location.href = '#/usercreate?admin=1';
            return;
        }

        // Server already initializied, try to perform login based on token
        if (localStorage.token) {
            Client.login(localStorage.token, function (error, token) {
                if (error) {
                    console.error('Unable to login', error);
                    window.location.href = '#/login';
                    return;
                }

                console.debug('Successfully logged in got token', token);

                // update token
                localStorage.token = token;
                $scope.showSideBar = !!Client._userInfo;
                window.location.href = '#/volumelist';
            });
            return;
        }

        // No token plain login
        window.location.href = '#/login';
    });
};
