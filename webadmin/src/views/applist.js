'use strict';

angular.module('Application').controller('AppListController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.installedApps = Client.getInstalledApps();

    $scope.showDetails = function (app) {
        $location.path('/app/' + app.id + '/details');
    };
}]);
