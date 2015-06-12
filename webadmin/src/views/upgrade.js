'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.availableRegions = [];
    $scope.availableSizes = [];

    $scope.migration = {
        region: null,
        size: null
    };

    $scope.showMigrationConfirm = function () {
        $('#migrationModal').modal('show');
    };

    $scope.doMigration = function () {
        Client.migrate($scope.migration.size.slug, $scope.migration.region.slug, function (error) {
            if (error) return console.error(error);
            $('#migrationModal').modal('hide');
        });
    };

    $scope.setRegion = function (regionSlug) {
        $scope.availableRegions.forEach(function (region) {
            if (region.slug.indexOf(regionSlug) === 0) $scope.migration.region = region;
        });
    };

    $scope.setSize = function (sizeSlug) {
        $scope.availableSizes.forEach(function (size) {
            if (size.slug.indexOf(sizeSlug) === 0) $scope.migration.size = size;
        });
    };

    Client.onReady(function () {
        AppStore.getSizes(function (error, result) {
            if (error) return console.error(error);

            // restult array is ordered by size
            var found = false;
            result = result.filter(function (size) {
                if (size.slug === $scope.config.size) {
                    $scope.setSize($scope.config.size);
                    found = true;
                    return true;
                } else {
                    return found;
                }
            });
            angular.copy(result, $scope.availableSizes);

            AppStore.getRegions(function (error, result) {
                if (error) return console.error(error);

                angular.copy(result, $scope.availableRegions);

                $scope.setRegion($scope.config.region);
                $scope.setSize($scope.config.size);
            });
        });
    });
}]);
