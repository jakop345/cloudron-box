'use strict';

angular.module('Application').controller('AccountController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.passwordchange = {
        busy: false,
        error: {},
        password: '',
        newPassword: '',
        newPasswordRepeat: ''
    };

    function passwordChangeReset (form) {
        $scope.passwordchange.error.password = null;
        $scope.passwordchange.error.newPassword = null;
        $scope.passwordchange.error.newPasswordRepeat = null;
        $scope.passwordchange.password = '';
        $scope.passwordchange.newPassword = '';
        $scope.passwordchange.newPasswordRepeat = '';

        if (form) {
            form.$setPristine();
            form.$setUntouched();
        }
    }

    $scope.doChangePassword = function (form) {
        $scope.passwordchange.error.password = null;
        $scope.passwordchange.error.newPassword = null;
        $scope.passwordchange.error.newPasswordRepeat = null;
        $scope.passwordchange.busy = true;

        Client.changePassword($scope.passwordchange.password, $scope.passwordchange.newPassword, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.passwordchange.error.password = true;
                    $scope.passwordchange.password = '';
                } else {
                    console.error('Unable to change password.', error);
                }
                return;
            }

            $scope.passwordchange.busy = false;
            passwordChangeReset(form);

            $('#passwordChangeModal').modal('hide');
        });
    };

    $scope.showChangePassword = function (form) {
        passwordChangeReset(form);

        $('#passwordChangeModal').modal('show');
    };
}]);
