'use strict';

angular.module('Application').controller('ActivityController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.config = Client.getConfig();

    $scope.eventLogs = [ ];

    $scope.actions = [
        { name: 'cloudron.activate', value: 'cloudron.activate' },
        { name: 'app.configure', value: 'app.configure' },
        { name: 'app.install', value: 'app.install' },
        { name: 'app.restore', value: 'app.restore' },
        { name: 'app.uninstall', value: 'app.uninstall' },
        { name: 'app.update', value: 'app.update' },
        { name: 'backup.finish', value: 'backup.finish' },
        { name: 'backup.start', value: 'backup.start' },
        { name: 'certificate.renew', value: 'certificate.renew' },
        { name: 'settings.climode', value: 'settings.climode' },
        { name: 'cloudron.start', value: 'cloudron.start' },
        { name: 'cloudron.update', value: 'cloudron.update' },
        { name: 'user.add', value: 'user.add' },
        { name: 'user.login', value: 'user.login' },
        { name: 'user.remove', value: 'user.remove' },
        { name: 'user.update', value: 'user.update' }
    ];

    $scope.currentPage = 1;
    $scope.pageItems = 20;
    $scope.action = '';
    $scope.search = '';

    function fetchEventLogs() {
        $scope.busy = true;

        Client.getEventLogs($scope.action ? $scope.action.value : null, $scope.search || null, $scope.currentPage, $scope.pageItems, function (error, eventLogs) {
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

    $scope.updateFilter = function () {
        fetchEventLogs();
    };
}]);
