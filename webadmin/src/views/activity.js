'use strict';

angular.module('Application').controller('ActivityController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.config = Client.getConfig();

    $scope.eventLogs = [ ];

    function fetchEventLogs() {
        Client.getEventLogs(1, 20, function (error, eventLogs) {
            if (error) return console.error(error);

            $scope.eventLogs = eventLogs;
        });
    }

    Client.onReady(function () {
        fetchEventLogs();
    });

}]);
