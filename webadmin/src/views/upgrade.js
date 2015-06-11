'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.availableRegions = [];
    $scope.availableSizes = [];
    $scope.availableBackups = [];

    $scope.migration = {
        regionSlug: '',
        sizeSlug: '',
        restoreKey: null
    };

    $scope.showMigrationConfirm = function () {
        $('#migrationModal').modal('show');
    };

    $scope.doMigration = function () {
        Client.migrate($scope.migration.sizeSlug, $scope.migration.restoreKey, $scope.migration.regionSlug, function (error) {
            if (error) return console.error(error);
            $('#migrationModal').modal('hide');
        });
    };

    Client.onReady(function () {
        Client.getBackups(function (error, backups) {
            if (error) return console.error(error);

            angular.copy(backups, $scope.availableBackups);
            $scope.migration.restoreKey = $scope.availableBackups[0] ? $scope.availableBackups[0].restoreKey : null;

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
    });
}]);
