'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.availableRegions = [];
    $scope.availableSizes = [];

    $scope.migration = {
        regionSlug: '',
        sizeSlug: ''
    };

    $scope.showMigrationConfirm = function () {
        $('#migrationModal').modal('show');
    };

    $scope.doMigration = function () {
        Client.migrate($scope.migration.sizeSlug, $scope.migration.regionSlug, function (error) {
            if (error) return console.error(error);
            $('#migrationModal').modal('hide');
        });
    };

    Client.onReady(function () {
        AppStore.getSizes(function (error, result) {
            if (error) return console.error(error);

            angular.copy(result, $scope.availableSizes);
            $scope.migration.sizeSlug = $scope.availableSizes[0].slug;

            AppStore.getRegions(function (error, result) {
                if (error) return console.error(error);

                angular.copy(result, $scope.availableRegions);
                $scope.migration.regionSlug = $scope.availableRegions[0].slug;
            });
        });
    });
}]);
