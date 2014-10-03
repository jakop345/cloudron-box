/* exported UserCreateController */

'use strict';

function UserCreateController ($scope, $routeParams, Client) {
    $scope.disabled = false;

    $scope.username = '';
    $scope.password = '';
    $scope.passwordRepeat = '';
    $scope.email = '';
    $scope.alreadyTaken = '';

    $scope.submit = function () {
        $scope.alreadyTaken = '';

        $scope.disabled = true;
        Client.createUser($scope.username, $scope.password, $scope.email, function (error) {
            if (error && error.statusCode === 409) {
                $scope.alreadyTaken = $scope.username;
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
