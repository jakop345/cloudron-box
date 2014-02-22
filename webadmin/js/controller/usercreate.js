'use strict';

function UserCreateController ($scope, $routeParams, Client) {
    console.debug('UserCreateController');

    $scope.disabled = false;

    $scope.username = '';
    $scope.password = '';
    $scope.passwordRepeat = '';
    // TODO do we really need this?
    $scope.email = 'xx@xx.xx';

    $scope.error = {};

    var createAdmin = !!($routeParams.admin);

    $scope.submit = function () {
        console.debug('Try to create user %s.', $scope.username);

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

        var func;
        if (createAdmin) {
            func = Client.createAdmin.bind(Client);
        } else {
            func = Client.createUser.bind(Client);
        }

        $scope.disabled = true;
        func($scope.username, $scope.password, $scope.email, function (error, result) {
            if (error) {
                console.error('Unable to create user.', error);
                if (error.statusCode === 409) {
                    $scope.error.name = 'Username already exists';
                    $scope.disabled = false;
                }
                return;
            }

            console.debug('Successfully create user', $scope.username);
            window.history.back();
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
