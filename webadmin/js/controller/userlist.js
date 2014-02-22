'use strict';

function UserListController ($scope, Client) {
    console.debug('UserListController');

    $scope.users = [];

    function refresh() {
        console.debug('refresh user list');

        Client.listUsers(function (error, result) {
            if (error) {
                console.error('Unable to get user listing.', error);
                return;
            }

            console.debug('Got userlist', result.users);
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
