'use strict';

function UserCreateController ($scope, $routeParams, Client) {
    $scope.disabled = false;

    $scope.username = '';
    $scope.password = '';
    $scope.passwordRepeat = '';
    // TODO do we really need this?
    $scope.email = 'xx@xx.xx';

    $scope.error = {};

    $scope.submit = function () {
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
        Client.createUser($scope.username, $scope.password, $scope.email, function (error) {
            if (error && error.statusCode === 409) return console.error('Username already exists');
            if (error) console.error('Unable to create user.', error);

            window.location.href = '#/userlist';
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
