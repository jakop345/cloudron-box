'use strict';

function LoginController ($scope, Client) {
    console.debug('LoginController');

    $scope.username = '';
    $scope.password = '';
    $scope.remember = true;
    $scope.disabled = false;
    $scope.error = {};

    // basically perform passive auth
    if (Client.getToken()) {
        Client.tokenLogin(Client.getToken(), function (error, token) {
            if (error) {
                console.error('Unable to login using previous token.', error);
                return;
            }

            console.debug('Successfully logged in. New token', token);
            window.location.href = '#/volumelist';
        });
    }

    $scope.submit = function () {
        console.debug('Try to login with user', $scope.username);

        $scope.error.username = null;
        $scope.disabled = true;

        Client.login($scope.username, $scope.password, function (error, token) {
            if (error) {
                console.error('Unable to login', error);
                if (error.statusCode === 401) {
                    $scope.error.username = 'Invalid credentials';
                    $scope.disabled = false;
                }
                return;
            }

            console.debug('Successfully logged in got token', token);

            if ($scope.remember) {
                localStorage.token = token;
            }

            window.location.href = '#/volumelist';
        });
    };
}
