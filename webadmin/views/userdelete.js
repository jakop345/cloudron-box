'use strict';

function UserDeleteController ($scope, $routeParams, Client) {
    console.debug('UserDeleteController');

    if (!$routeParams.username) {
        console.error('No user provided.');
        return window.location.replace('#/volumelist');
    }

    $scope.disabled = false;
    $scope.username = $routeParams.username;
    $scope.form = {};
    $scope.form.username = '';
    $scope.form.password = '';
    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to delete user %s.', $routeParams.username);

        $scope.error.username = null;
        $scope.error.password = null;

        if ($routeParams.username !== $scope.form.username) {
            $scope.error.username = 'Username does not match';
            return;
        }

        $scope.disabled = true;
        Client.removeUser($routeParams.username, $scope.form.password, function (error, result) {
            if (error) {
                console.error('Unable to delete user.', error);

                if (error.statusCode === 401) {
                    $scope.error.password = 'Wrong password';
                }

                $scope.disabled = false;
                return;
            }

            console.debug('Successfully deleted user', $scope.form.username);
            window.location.replace('#/volumelist');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

