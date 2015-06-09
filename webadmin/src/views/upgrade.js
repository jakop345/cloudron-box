'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.availableSizes = [];
    $scope.currentSize = 'small';
    $scope.currentRegion = 'sfo';

    $scope.migration = {
        sizeSlug: 'small'
    };

    $scope.showMigrationConfirm = function () {
        $('#migrationModal').modal('show');
    };

    $scope.doMigration = function () {
        Client.migrate($scope.migration.sizeSlug, function (error) {
            if (error) return console.error(error);
            $('#migrationModal').modal('hide');
        });
    };

    Client.onReady(function () {
        AppStore.getSizes(function (error, result) {
            if (error) return console.error(error);
            angular.copy(result, $scope.availableSizes);
            $scope.migration.sizeSlug = $scope.availableSizes[0].slug;
        });
    });
}]);
