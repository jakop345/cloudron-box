'use strict';

function UserListController ($scope, Client) {
    $scope.users = [];

    $scope.isMe = function (user) {
        return user.username === Client.getUserInfo().username;
    };

    function refresh() {
        Client.listUsers(function (error, result) {
            if (error) {
                console.error('Unable to get user listing.', error);
                return;
            }

            $scope.users = result.users;
        });
    }

    $scope.createUser = function () {
        window.location.href = '#/usercreate';
    };

    $scope.deleteUser = function (username) {
        // TODO urlencode?
        window.location.href = '#/userdelete?username=' + username;
    };

    refresh();
}
