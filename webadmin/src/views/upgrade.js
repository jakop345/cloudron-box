'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.availableSizes = [];

    $scope.appMigrate = {
        sizeSlug: 'small'
    };

    Client.onReady(function () {
        AppStore.getSizes(function (error, result) {
            if (error) return console.error(error);
            angular.copy(result, $scope.availableSizes);
            $scope.appMigrate.sizeSlug = $scope.availableSizes[0].slug;
        });
    });
}]);
