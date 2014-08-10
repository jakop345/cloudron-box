'use strict';

var MainController = function ($scope, $route, Client) {
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
        window.location.href = '/api/v1/session/logout';
    };

    Client.setClientCredentials('cid-webadmin', 'unused');
    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            console.error('Unable to connect.', error);
            return;
        }

        if (isFirstTime) {
            window.location.href = '/setup.html';
            return;
        }

        // Server already initializied, try to perform login based on token
        var callbackURL = window.location.origin + '/login_callback.html';
        if (localStorage.token) {
            Client.login(localStorage.token, function (error, token) {
                if (error) {
                    console.error('Unable to login', error);
                    window.location.href = '/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + Client._clientId + '&redirect_uri=' + callbackURL;
                    return;
                }

                console.debug('Successfully logged in got token', token);

                // update token
                localStorage.token = token;
                $scope.showSideBar = !!Client._userInfo;
            });
            return;
        } else {
            window.location.href = '/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + Client._clientId + '&redirect_uri=' + callbackURL;
        }
    });
};
