'use strict';

function UserDeleteController ($scope, $routeParams, client) {
    console.debug('UserDeleteController');

    if (!$routeParams.username) {
        console.error('No user provided.');
        return window.location.replace('#/maintabview');
    }

    $scope.disabled = false;
    $scope.username = $routeParams.username;
    $scope.form = {};
    $scope.form.username = '';
    $scope.form.password = '';

    $scope.submit = function () {
        console.debug('Try to delete user', $scope.form.username, 'on', client.server);

        $scope.disabled = true;
        client.removeUser($scope.form.username, $scope.form.password, function (error, result) {
            if (error) {
                console.error('Unable to delete user.', error);
                $scope.disabled = false;
                return;
            }

            console.debug('Successfully deleted user', $scope.form.username);
            window.location.replace('#/maintabview');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

