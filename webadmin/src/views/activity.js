'use strict';

angular.module('Application').controller('ActivityController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.config = Client.getConfig();

    $scope.eventLogs = [ ];

    $scope.currentPage = 1;
    $scope.pageItems = 20;


    function fetchEventLogs() {
        $scope.busy = true;

        Client.getEventLogs($scope.currentPage, $scope.pageItems, function (error, eventLogs) {
            $scope.busy = false;

            if (error) return console.error(error);

            $scope.eventLogs = eventLogs;
        });
    }

    Client.onReady(function () {
        fetchEventLogs();
    });

    $scope.showNextPage = function () {
        $scope.currentPage++;
        fetchEventLogs();
    };

    $scope.showPrevPage = function () {
        if ($scope.currentPage > 1) $scope.currentPage--;
        else $scope.currentPage = 1;

        fetchEventLogs();
    };
}]);
