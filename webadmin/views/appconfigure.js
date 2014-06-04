'use strict';

var AppConfigureController = function ($scope, $routeParams, Client) {
    $scope.app = { };
    $scope.disabled = false;
    $scope.error = { };

    $scope.installApp = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        Client.installApp($routeParams.id, $scope.app.password, $scope.app.config, function (error) {
            if (error) {
                console.error('Unable to install app.', error);
                if (error.statusCode === 409) {
                    $scope.error.name = 'Application already exists.';
                } else if (error.statusCode === 403) {
                    $scope.error.password = 'Wrong password provided.';
                    $scope.app.password = '';
                } else {
                    $scope.error.name = 'App with the name ' + $scope.app.name + ' cannot be created.';
                }

                $scope.disabled = false;
                return;
            }

            window.location.replace('#/applist');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
};
