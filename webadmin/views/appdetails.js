/* global $:true */
/* exported AppDetailsController */

'use strict';

var AppDetailsController = function ($scope, $http, $routeParams, $timeout, Client) {
    $scope.app = {};
    $scope.initialized = false;
    $scope.updateAvailable = false;

    $scope.startApp = function () {
        Client.startApp($routeParams.appId, function (error) {
            if (error) console.error(error);
        });
    };

    $scope.stopApp = function () {
        Client.stopApp($routeParams.appId, function (error) {
            if (error) console.error(error);
        });
    };

    $scope.updateApp = function () {
        Client.updateApp($routeParams.appId, function (error) {
            if (error) console.error(error);
        });
    };

    $scope.deleteApp = function () {
        $('#deleteAppModal').modal('hide');

        Client.removeApp($routeParams.appId, function (error) {
            if (error) console.error(error);
            window.location.href = '#/';
        });
    };

    var lineCount = 0;
    $scope.refreshLogs = function () {
        console.log('Refreshing logs for', $scope.app.id);
        Client.getAppLogs($routeParams.appId, { follow: lineCount != 0, fromLine: lineCount }, function (error, logs) {
            if (error) {
                console.error(error);
            } else {
                var lines = logs.split('\r\n');
                lines.forEach(function (line) { $('#logs').append(ansi_up.ansi_to_html(line) + '<br>'); });
                lineCount += lines.length;
                $("#logs").animate({ scrollTop: $("#logs").attr("scrollHeight") }, 1000);
            }

            console.log('Retrying');
            $timeout($scope.refreshLogs, 0);
        });
    };

    Client.onReady(function () {

        Client.getApp($routeParams.appId, function (error, app) {
            if (error) {
                window.location.href = '#/';
                return;
            }

            $scope.app = app;

            if ($scope.app.installationState === 'installed') $scope.refreshLogs();

            if (Client.getConfig().update && Client.getConfig().update.apps) {
                $scope.updateAvailable = Client.getConfig().update.apps.some(function (x) {
                    return x.appId === $scope.app.appStoreId && x.version !== $scope.app.version;
                });
            }

            $scope.initialized = true;
        });
    });
};
