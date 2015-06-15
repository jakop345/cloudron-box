'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.availableRegions = [];
    $scope.availableSizes = [];

    $scope.currentSize = null;
    $scope.currentRegionSlug = null;

    $scope.migration = {
        region: null,
        size: null,
        error: {},
        password: null
    };

    $scope.showUpgradeConfirm = function (size) {
        $scope.migration.size = size;
        $('#migrationModal').modal('show');
    };

    $scope.showMigrationConfirm = function () {
        $('#migrationModal').modal('show');
    };

    $scope.doMigration = function () {
        Client.migrate($scope.migration.size.slug, $scope.migration.region.slug, $scope.migration.password, function (error) {
            if (error && error.statusCode === 403) {
                $scope.migration.error.password = true;
                $scope.migration.password = '';
                $('#upgradePasswordInput').focus();
                return;
            } else if (error) {
                return console.error(error);
            }

            $('#migrationModal').modal('hide');
        });
    };

    $scope.setRegion = function (regionSlug) {
        $scope.availableRegions.forEach(function (region) {
            if (region.slug.indexOf(regionSlug) === 0) $scope.migration.region = region;
        });
    };

    Client.onReady(function () {
        AppStore.getSizes(function (error, result) {
            if (error) return console.error(error);

            // restult array is ordered by size
            var found = false;
            result = result.filter(function (size) {
                if (size.slug === $scope.config.size) {
                    $scope.currentSize = size;
                    $scope.migration.size = size;
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

                $scope.currentRegionSlug = $scope.config.region;
                $scope.setRegion($scope.config.region);
            });
        });
    });

    // setup all the dialog focus handling
    ['migrationModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
