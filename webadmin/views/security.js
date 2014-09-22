/* exported SecurityController */

'use strict';

var SecurityController = function ($scope, Client) {
    $scope.activeClients = [];
    $scope.tokenInUse = null;

    $scope.delTokensByClientId = function (client) {
        Client.delTokensByClientId(client.clientId, function (error) {
            if (error) return console.error(error);

            Client.getActiveClients(function (error, activeClients) {
                if (error) return console.error(error);

                $scope.activeClients = activeClients;
            });
        });
    };

    Client.onReady(function () {
        $scope.tokenInUse = Client._token;

        Client.getActiveClients(function (error, activeClients) {
            if (error) return console.error(error);

            $scope.activeClients = activeClients;
        });
    });
};
