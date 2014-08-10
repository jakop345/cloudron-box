'use strict';

var SetupController = function ($scope, Client) {
    $scope.disabled = false;

    $scope.username = '';
    $scope.password = '';
    $scope.passwordRepeat = '';
    // TODO do we really need this?
    $scope.email = 'xx@xx.xx';

    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to create admin %s.', $scope.username);

        $scope.error.name = null;
        $scope.error.password = null;
        $scope.error.passwordRepeat = null;

        if (!$scope.username) {
            console.error('Username must not be empty');
            $scope.error.name = 'Username must not be empty';
            $scope.error.password = '';
            $scope.error.passwordRepeat = '';
            return;
        }

        if ($scope.password !== $scope.passwordRepeat) {
            console.error('Passwords dont match.');
            $scope.error.name = '';
            $scope.error.passwordRepeat = 'Passwords do not match';
            $scope.passwordRepeat = '';
            return;
        }

        $scope.disabled = true;
        Client.createAdmin($scope.username, $scope.password, $scope.email, function (error, result) {
            if (error) {
                console.error('Unable to create user.', error);
                if (error.statusCode === 409) {
                    $scope.error.name = 'Username already exists';
                    $scope.disabled = false;
                }
                return;
            }

            console.debug('Successfully create user', $scope.username);
            window.location.href = '/';
        });
    };

    Client.setClientCredentials('cid-webadmin', 'unused');
    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            console.error('Unable to connect.', error);
            return;
        }

        if (!isFirstTime) {
            window.location.href = '/';
            return;
        }
    });
};
