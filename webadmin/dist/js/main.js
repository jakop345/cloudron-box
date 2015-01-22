/* exported MainController */

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
        Client.logout();
    };

    $scope.login = function () {
        var callbackURL = window.location.origin + '/login_callback.html';
        var scope = 'root,profile,apps,roleAdmin';
        window.location.href = '/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + Client._clientId + '&redirect_uri=' + callbackURL + '&scope=' + scope;
    };

    $scope.setup = function () {
        window.location.href = '/setup.html';
    };

    $scope.error = function (error) {
        console.error(error);
        window.location.href = '/error.html';
    };

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) return $scope.error(error);
        if (isFirstTime) return $scope.setup();

        // we use the config request as an indicator if the token is still valid
        // TODO we should probably attach such a handler for each request, as the token can get invalid
        // at any time!
        if (localStorage.token) {
            Client.refreshConfig(function (error) {
                if (error && error.statusCode === 401) return $scope.login();
                if (error) return $scope.error(error);

                Client.userInfo(function (error, result) {
                    if (error) return $scope.error(error);

                    Client.setUserInfo(result);

                    Client.refreshInstalledApps(function (error) {
                        if (error) return $scope.error(error);

                        // kick off installed apps and config polling
                        var refreshAppsTimer = $interval(Client.refreshInstalledApps.bind(Client), 2000);
                        var refreshConfigTimer = $interval(Client.refreshConfig.bind(Client), 5000);

                        $scope.$on('$destroy', function () {
                            $interval.cancel(refreshAppsTimer);
                            $interval.cancel(refreshConfigTimer);
                        });

                        // now mark the Client to be ready
                        Client.setReady();

                        // now show UI
                        $scope.initialized = true;
                    });
                });
            });
        } else {
            $scope.login();
        }
    });
};
