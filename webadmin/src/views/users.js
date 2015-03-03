'use strict';

angular.module('Application').controller('UsersController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.ready = false;
    $scope.users = [];
    $scope.userInfo = Client.getUserInfo();

    $scope.userremove = {
        busy: false,
        error: {},
        userInfo: {},
        username: '',
        password: ''
    };

    $scope.useradd = {
        busy: false,
        alreadyTaken: false,
        error: {},
        username: '',
        email: ''
    };

    $scope.isMe = function (user) {
        return user.username === Client.getUserInfo().username;
    };

    $scope.isAdmin = function (user) {
        return !!user.admin;
    };

    $scope.toggleAdmin = function (user) {
        Client.setAdmin(user.username, !user.admin, function (error) {
            if (error) return console.error(error);

            user.admin = !user.admin;
        });
    };

    $scope.doAdd = function () {
        $scope.useradd.alreadyTaken = '';
        $scope.useradd.error.username = null;
        $scope.useradd.error.email = null;

        Client.createUser($scope.useradd.username, $scope.useradd.email, function (error) {
            if (error && error.statusCode === 409) {
                $scope.useradd.alreadyTaken = $scope.username;
                return console.error('Username already taken');
            }
            if (error && error.statusCode === 400) {
                if (error.message.indexOf('email') !== -1) {
                    $scope.useradd.error.email = 'Invalid Email';
                    $scope.useradd.email = '';
                    return;
                }
                if (error.message.indexOf('username') !== -1) {
                    $scope.useradd.error.username = 'Invalid Username';
                    $scope.useradd.username = '';
                    return;
                }
                return;
            }
            if (error) console.error('Unable to create user.', error);

            refresh();
            $('#userAddModal').modal('hide');
        });
    };

    $scope.showUserRemove = function (userInfo) {
        $scope.userremove.error.username = null;
        $scope.userremove.error.password = null;
        $scope.userremove.userInfo = userInfo;
        $('#userRemoveModal').modal('show');
    };

    $scope.doUserRemove = function (form) {
        $scope.userremove.error.username = null;
        $scope.userremove.error.password = null;

        if ($scope.userremove.username !== $scope.userremove.userInfo.username) {
            $scope.userremove.error.username = 'Username does not match';
            $scope.userremove.username = '';
            return;
        }

        Client.removeUser($scope.userremove.username, $scope.userremove.password, function (error) {
            if (error && error.statusCode === 403) {
                $scope.userremove.error.password = 'Incorrect password';
                $scope.userremove.password = '';
                return;
            }
            if (error) return console.error('Unable to delete user.', error);

            $scope.userremove.userInfo = {};
            $scope.userremove.username = '';
            $scope.userremove.password = '';

            form.$setPristine();
            form.$setUntouched();

            $('#userRemoveModal').modal('hide');

            refresh();
        });
    };

    function refresh() {
        Client.listUsers(function (error, result) {
            if (error) return console.error('Unable to get user listing.', error);

            $scope.users = result.users;
            $scope.ready = true;
        });
    }

    refresh();

    // setup all the dialog focus handling
    ['userAddModal', 'userRemoveModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
