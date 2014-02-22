'use strict';

function UserPasswordController ($scope, $routeParams, client) {
    console.debug('UserPasswordController');

    $scope.disabled = false;
    $scope.user = client.getUserInfo();
    $scope.currentPassword = '';
    $scope.newPassword = '';
    $scope.repeatPassword = '';

    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to change password for user %s on %s.', $scope.user.username, client.server);

        $scope.error.currentPassword = null;
        $scope.error.newPassword = null;
        $scope.error.repeatPassword = null;

        if ($scope.newPassword !== $scope.repeatPassword) {
            $scope.error.repeatPassword = 'Passwords do not match';
            $scope.repeatPassword = '';
            return;
        }

        $scope.disabled = true;
        client.changePassword($scope.currentPassword, $scope.newPassword, function (error, result) {
            if (error) {
                console.error('Unable to change password.', error);

                if (error.statusCode === 403) {
                    $scope.$apply(function () {
                        $scope.disabled = false;
                        $scope.error.currentPassword = 'Provided password is wrong';
                        $scope.currentPassword = '';
                        $scope.newPassword = '';
                        $scope.repeatPassword = '';
                    });
                }

                return;
            }

            window.history.back();
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
