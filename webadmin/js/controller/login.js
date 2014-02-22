'use strict';

function LoginController ($scope, Client) {
    console.debug('LoginController');

    $scope.username = '';
    $scope.password = '';
    $scope.remember = true;
    $scope.disabled = false;
    $scope.error ={};

    $scope.submit = function () {
        console.debug('Try to login on', Client.getServer(), 'with user', $scope.username);

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

            window.location.href = '#/maintabview';
        });
    };
}
