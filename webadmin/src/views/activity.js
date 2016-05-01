'use strict';

angular.module('Application').controller('ActivityController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.config = Client.getConfig();

    $scope.eventLogs = [ ];

    function fetchEventLogs() {
        Client.getEventLogs(1, 20, function (error, eventLogs) {
            if (error) return console.error(error);

            $scope.eventLogs = eventLogs;
            $scope.eventLogs.forEach(function (e) {
                e.details = Object.keys(e.data).map(function (k) { return k + ':' + e.data[k]; }).join(' ');
            });
        });
    }

    Client.onReady(function () {
        fetchEventLogs();
    });

}]);
