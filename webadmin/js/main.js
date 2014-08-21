'use strict';

var MainController = function ($scope, $route, $interval, Client) {
    $scope.initialized = false;
    $scope.userInfo = Client.getUserInfo();
    $scope.installedApps = Client.getInstalledApps();

    $scope.isActive = function (url) {
        if (!$route.current) return false;
        return $route.current.$$route.originalPath.indexOf(url) === 0;
    };

    $scope.logout = function (event) {
        event.stopPropagation();

        $scope.initialized = false;

        // TODO actually perform logout on the server
        localStorage.removeItem('token');
        Client.logout();

        window.location.href = '/api/v1/session/logout';
    };

    $scope.login = function () {
        var callbackURL = window.location.origin + '/login_callback.html';
        window.location.href = '/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + Client._clientId + '&redirect_uri=' + callbackURL;
    };

    $scope.setup = function () {
        window.location.href = '/setup.html';
    };

    $scope.error = function (error) {
        // TODO show some error UI
        console.error(error);
    };

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) return $scope.error(error);
        if (isFirstTime) return $scope.setup();

        // Server already initialized, try to perform login based on token
        if (localStorage.token) {
            Client.login(localStorage.token, function (error, token) {
                if (error) return $scope.login();

                // update token
                localStorage.token = token;

                // kick off installed apps polling
                var refreshTimer = $interval(Client.refreshInstalledApps.bind(Client), 2000);
                $scope.$on('$destroy', function () {
                    $interval.cancel(refreshTimer);
                });

                // now show UI
                $scope.initialized = true;
            });
        } else {
            $scope.login();
        }
    });
};
