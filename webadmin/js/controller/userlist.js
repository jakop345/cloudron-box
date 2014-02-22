'use strict';

function UserListController ($scope, client) {
    console.debug('UserListController');

    $scope.users = [];

    function refresh() {
        console.debug('refresh user list');

        client.listUsers(function (error, result) {
            if (error) {
                console.error('Unable to get user listing.', error);
                return;
            }

            console.debug('Got userlist', result.users);

            $scope.$apply(function () {
                $scope.users = result.users;
            });
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
