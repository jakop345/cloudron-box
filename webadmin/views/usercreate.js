/* exported UserCreateController */

'use strict';

function UserCreateController ($scope, $routeParams, Client) {
    $scope.disabled = false;

    $scope.username = '';
    $scope.password = '';
    $scope.passwordRepeat = '';
    $scope.email = 'xx@xx.xx';

    $scope.error = {};

    $scope.submit = function () {
        $scope.error.username = null;
        $scope.error.email = null;
        $scope.error.password = null;
        $scope.error.passwordRepeat = null;

        if (!$scope.username) {
            $scope.error.username = 'Username must not be empty';
            return;
        }

        if (!$scope.email) {
            $scope.error.email = 'Email must not be empty';
            return;
        }

        if ($scope.password !== $scope.passwordRepeat) {
            $scope.error.passwordRepeat = 'Passwords do not match';
            $scope.passwordRepeat = '';
            return;
        }

        $scope.disabled = true;
        Client.createUser($scope.username, $scope.password, $scope.email, function (error) {
            if (error && error.statusCode === 409) {
                $scope.error.username = 'Username already taken';
                return console.error('Username already taken');
            }
            if (error) console.error('Unable to create user.', error);

            window.location.href = '#/userlist';
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
