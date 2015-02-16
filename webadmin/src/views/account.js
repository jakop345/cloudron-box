/* exported AccountController */

'use strict';

var AccountController = function ($scope, $location, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.changePassword = function () {
        $location.path('/userpassword');
        // window.location.href = '#/userpassword';
    };
};
