'use strict';

angular.module('Application').controller('SecurityController', ['$scope', 'Client', function ($scope, Client) {
    $scope.activeClients = [];
    $scope.tokenInUse = null;

    $scope.removeAccessTokens = function (client, event) {
        client._busy = true;

        Client.delTokensByClientId(client.id, function (error) {
            if (error) return console.error(error);
            $(event.target).addClass('disabled');
            client._busy = false;
        });
    };

    Client.onReady(function () {
        $scope.tokenInUse = Client._token;

        Client.getOAuthClients(function (error, activeClients) {
            if (error) return console.error(error);

            $scope.activeClients = activeClients;
        });
    });
}]);
