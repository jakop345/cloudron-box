'use strict';

angular.module('Application').controller('UsersController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.ready = false;
    $scope.users = [];
    $scope.groups = [];
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
        email: '',
        displayName: '',
        sendInvite: true
    };

    $scope.useredit = {
        busy: false,
        error: {},
        userInfo: {},
        email: '',
        displayName: '',
        password: ''
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

    $scope.sendInvite = function (user) {
        Client.sendInvite(user.username, function (error) {
            if (error) return console.error(error);

            Client.notify('', 'Invitation was successfully sent to ' + user.email + '.', false, 'success');
        });
    };

    $scope.showUserAdd = function () {
        $scope.useradd.error = {};
        $scope.useradd.username = '';
        $scope.useradd.email = '';
        $scope.useradd.displayName = '';

        $scope.useradd_form.$setUntouched();
        $scope.useradd_form.$setPristine();

        $('#userAddModal').modal('show');
    };

    $scope.doAdd = function () {
        $scope.useradd.busy = true;

        $scope.useradd.alreadyTaken = false;
        $scope.useradd.error.username = null;
        $scope.useradd.error.email = null;
        $scope.useradd.error.displayName = null;

        Client.createUser($scope.useradd.username, $scope.useradd.email, $scope.useradd.displayName, $scope.useradd.sendInvite, function (error) {
            $scope.useradd.busy = false;

            if (error && error.statusCode === 409) {
                $scope.useradd.error.username = 'Username or Email already taken';
                $scope.useradd.error.email = 'Username or Email already taken';
                $scope.useradd_form.username.$setPristine();
                $scope.useradd_form.email.$setPristine();
                $scope.useradd_form.displayName.$setPristine();
                $('#inputUserAddUsername').focus();
                return;
            }
            if (error && error.statusCode === 400) {
                if (error.message.indexOf('email') !== -1) {
                    $scope.useradd.error.email = 'Invalid Email';
                    $scope.useradd.error.emailAttempted = $scope.useradd.email;
                    $scope.useradd_form.email.$setPristine();
                    $('#inputUserAddEmail').focus();
                } else if (error.message.indexOf('username') !== -1) {
                    $scope.useradd.error.username = 'Invalid Username';
                    $scope.useradd.error.usernameAttempted = $scope.useradd.username;
                    $scope.useradd_form.username.$setPristine();
                    $('#inputUserAddUsername').focus();
                } else if (error.message.indexOf('displayName') !== -1) {
                    $scope.useradd.error.displayName = 'Invalid Name';
                    $scope.useradd.error.displayNameAttempted = $scope.useradd.displayName;
                    $scope.useradd_form.displayName.$setPristine();
                    $('#inputUserAddDisplayName').focus();

                } else {
                    console.error('Unable to create user.', error.statusCode, error.message);
                }
                return;
            }
            if (error) return console.error('Unable to create user.', error.statusCode, error.message);

            $scope.useradd.error = {};
            $scope.useradd.username = '';
            $scope.useradd.email = '';
            $scope.useradd.displayName = '';

            $scope.useradd_form.$setUntouched();
            $scope.useradd_form.$setPristine();

            refresh();

            $('#userAddModal').modal('hide');
        });
    };

    $scope.showUserEdit = function (userInfo) {
        $scope.useredit.error.displayName = null;
        $scope.useredit.error.email = null;
        $scope.useredit.displayName = userInfo.displayName;
        $scope.useredit.email = userInfo.email;
        $scope.useredit.userInfo = userInfo;
        $scope.useredit.groups = userInfo.groupIds;

        $scope.useredit_form.$setPristine();
        $scope.useredit_form.$setUntouched();

        $('#userEditModal').modal('show');
    };

    $scope.doUserEdit = function () {
        $scope.useredit.error.displayName = null;
        $scope.useredit.error.email = null;
        $scope.useredit.error.password = null;
        $scope.useredit.busy = true;

        var data = {
            id: $scope.useredit.userInfo.id,
            email: $scope.useredit.email,
            displayName: $scope.useredit.displayName
        };

        Client.updateUser(data, $scope.useredit.password, function (error) {
            $scope.useredit.busy = false;

            if (error && error.statusCode === 403) {
                $scope.useredit.error.password = 'Wrong password';
                $scope.useredit.password = '';
                $scope.useredit_form.password.$setPristine();
                $('#inputUserEditPassword').focus();
                return;
            }
            if (error) return console.error('Unable to update user:', error);

            $scope.useredit.userInfo = {};
            $scope.useredit.email = '';
            $scope.useredit.displayName = '';
            $scope.useredit.password = '';

            $scope.useredit_form.$setPristine();
            $scope.useredit_form.$setUntouched();

            refresh();

            $('#userEditModal').modal('hide');
        });
    };

    $scope.showUserRemove = function (userInfo) {
        $scope.userremove.error.username = null;
        $scope.userremove.error.password = null;
        $scope.userremove.username = '';
        $scope.userremove.password = '';
        $scope.userremove.userInfo = userInfo;

        $scope.userremove_form.$setPristine();
        $scope.userremove_form.$setUntouched();

        $('#userRemoveModal').modal('show');
    };

    $scope.doUserRemove = function () {
        $scope.userremove.error.username = null;
        $scope.userremove.error.password = null;

        if ($scope.userremove.username !== $scope.userremove.userInfo.username) {
            $scope.userremove.error.username = 'Username does not match';
            $scope.userremove.username = '';
            $('#inputUserRemoveUsername').focus();
            return;
        }

        $scope.userremove.busy = true;

        Client.removeUser($scope.userremove.userInfo.id, $scope.userremove.password, function (error) {
            $scope.userremove.busy = false;

            if (error && error.statusCode === 403) {
                $scope.userremove.error.password = 'Wrong password';
                $scope.userremove.password = '';
                $scope.userremove_form.password.$setPristine();
                $('#inputUserRemovePassword').focus();
                return;
            }
            if (error) return console.error('Unable to delete user.', error);

            $scope.userremove.userInfo = {};
            $scope.userremove.username = '';
            $scope.userremove.password = '';

            $scope.userremove_form.$setPristine();
            $scope.userremove_form.$setUntouched();

            refresh();

            $('#userRemoveModal').modal('hide');
        });
    };

    function refresh() {
        Client.getGroups(function (error, result) {
            if (error) return console.error('Unable to get group listing.', error);

            $scope.groups = result;

            Client.listUsers(function (error, result) {
                if (error) return console.error('Unable to get user listing.', error);

                $scope.users = result.users;
                $scope.ready = true;
            });
        });
    }

    refresh();

    // setup all the dialog focus handling
    ['userAddModal', 'userRemoveModal', 'userEditModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
