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
        console.debug('Try to create user %s on %s.', $scope.username, Client.getServer());

        $scope.error.name = null;
        $scope.error.password = null;
        $scope.error.passwordRepeat = null;

        if ($scope.password !== $scope.passwordRepeat) {
            console.error('Passwords dont match.');
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
                    $scope.$apply(function () {
                        $scope.error.name = 'Username already exists';
                        $scope.disabled = false;
                    });
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
