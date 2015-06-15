'use strict';

angular.module('Application').controller('UpgradeController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.busy = false;
    $scope.availableRegions = [];
    $scope.availableSizes = [];

    $scope.currentSize = null;
    $scope.currentRegionSlug = null;

    $scope.upgrade = {
        size: null,
        error: {},
        password: null
    };

    $scope.relocation = {
        region: null,
        error: {},
        password: null
    };

    $scope.showUpgradeConfirm = function (size) {
        $scope.upgrade.size = size;
        $('#upgradeModal').modal('show');
    };

    $scope.upgrade = function () {
        $scope.busy = true;

        Client.migrate($scope.upgrade.size.slug, $scope.currentRegionSlug, $scope.upgrade.password, function (error) {
            $scope.busy = false;

            if (error && error.statusCode === 403) {
                $scope.upgrade.error.password = true;
                $scope.upgrade.password = '';
                $('#upgradePasswordInput').focus();
                return;
            } else if (error) {
                return console.error(error);
            }

            $('#upgradeModal').modal('hide');
        });
    };

    $scope.showRelocationConfirm = function () {
        $('#relocationModal').modal('show');
    };

    $scope.relocate = function () {
        $scope.busy = true;

        Client.migrate($scope.currentSize.slug, $scope.relocation.region.slug, $scope.relocation.password, function (error) {
            $scope.busy = false;

            if (error && error.statusCode === 403) {
                $scope.relocation.error.password = true;
                $scope.relocation.password = '';
                $('#relocationPasswordInput').focus();
                return;
            } else if (error) {
                return console.error(error);
            }

            $('#relocationModal').modal('hide');
        });
    };

    $scope.setRegion = function (regionSlug) {
        $scope.availableRegions.forEach(function (region) {
            if (region.slug.indexOf(regionSlug) === 0) $scope.relocation.region = region;
        });
    };

    Client.onReady(function () {
        AppStore.getSizes(function (error, result) {
            if (error) return console.error(error);

            // result array is ordered by size
            var found = false;
            result = result.filter(function (size) {
                if (size.slug === $scope.config.size) {
                    $scope.currentSize = size;
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
    ['upgradeModal', 'relocationModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
