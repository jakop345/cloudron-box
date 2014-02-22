'use strict';

function AdvancedConnectionController ($scope, Client) {
    console.log('AdvancedConnectionController');

    $scope.server = 'localhost:3000';
    $scope.remember = true;

    $scope.submit = function () {
        Client.setServer($scope.server);

        console.debug('Try to connect to', Client.getServer());

        Client.isServerFirstTime(function (error, isFirstTime) {
            if (error) {
                console.error('Unable to connect.', error);
                return;
            }

            console.debug('Successfully connect to server', Client.getServer());

            if ($scope.remember) {
                localStorage.server = Client.getServer();
            }

            sessionStorage.server = Client.getServer();

            if (isFirstTime) {
                window.location.href = '#/usercreate?admin=1';
            } else {
                window.location.href = '#/login';
            }
        });
    };
}
