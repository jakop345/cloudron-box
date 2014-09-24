/* global $:true */
/* exported AppDetailsController */

'use strict';

var AppDetailsController = function ($scope, $http, $routeParams, Client) {
    $scope.app = {};
    $scope.initialized = false;
    $scope.updateAvailable = false;
    $scope.activeTab = 'day';

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

    $scope.updateGraphs = function () {
        var cpuUsageTarget = 'transformNull(' +
        'scale(divideSeries(' +
            'sumSeries(collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user),' +
            'sumSeries(collectd.localhost.cpu-0.cpu-idle,collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user,collectd.localhost.cpu-0.cpu-wait)), 100), 0)';

        var memoryUsageTxTarget = 'transformNull(collectd.localhost.interface-eth0.if_octets.tx, 0)';
        var memoryUsageRxTarget = 'transformNull(collectd.localhost.interface-eth0.if_octets.rx, 0)';

        var diskUsageAppsUsedTarget = 'transformNull(collectd.localhost.df-loop0.df_complex-used, 0)';
        var diskUsageDataUsedTarget = 'transformNull(collectd.localhost.df-loop1.df_complex-used, 0)';

        var activeTab = $scope.activeTab;
        var from = '-24hours';
        switch (activeTab) {
        case 'day': from = '-24hours'; break;
        case 'month': from = '-1month'; break;
        case 'year': from = '-1year'; break;
        default: console.log('internal errror');
        }

        Client.graphs([ cpuUsageTarget, memoryUsageTxTarget, memoryUsageRxTarget, diskUsageAppsUsedTarget, diskUsageDataUsedTarget ], from, function (error, data) {
            if (error) return console.log(error);

            // CPU
            var transformedCpu = data[0].datapoints.map(function (point) { return { y: point[0], x: point[1] } });

            var cpuGraph = new Rickshaw.Graph({
                element: document.querySelector('#' + activeTab + 'CpuChart'),
                renderer: 'area',
                width: 580,
                height: 250,
                min: 0,
                max: 100,
                series: [{
                    color: 'steelblue',
                    data: transformedCpu,
                    name: 'cpu'
                }]
            });

            var cpuXAxis = new Rickshaw.Graph.Axis.Time({ graph: cpuGraph });
            var cpuYAxis = new Rickshaw.Graph.Axis.Y({
                graph: cpuGraph,
                orientation: 'left',
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
                element: document.getElementById(activeTab + 'CpuYAxis'),
            });

            var cpuHoverDetail = new Rickshaw.Graph.HoverDetail({
                graph: cpuGraph,
                formatter: function(series, x, y) {
                    var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                    var content = swatch + series.name + ": " + new Number(y).toFixed(2) + '%<br>';
                    return content;
                }
            });

            cpuGraph.render();

            // memory
            var transformedTx = data[1].datapoints.map(function (point) { return { y: point[0], x: point[1] } });
            var transformedRx = data[2].datapoints.map(function (point) { return { y: point[0], x: point[1] } });

            var memoryGraph = new Rickshaw.Graph({
                element: document.querySelector('#' + activeTab + 'memoryChart'),
                renderer: 'area',
                width: 580,
                height: 250,
                series: [ {
                    color: 'steelblue',
                    data: transformedTx,
                    name: 'tx'
                }, {
                    color: 'green',
                    data: transformedRx,
                    name: 'rx'
                } ]
            } );

            var memoryXAxis = new Rickshaw.Graph.Axis.Time({ graph: memoryGraph });
            var memoryYAxis = new Rickshaw.Graph.Axis.Y({
                graph: memoryGraph,
                orientation: 'left',
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
                element: document.getElementById(activeTab + 'memoryYAxis'),
            });

            var memoryHoverDetail = new Rickshaw.Graph.HoverDetail({
                graph: memoryGraph,
                formatter: function(series, x, y) {
                    var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                    var content = swatch + series.name + ": " + new Number(y/1024).toFixed(2) + 'KB<br>';
                    return content;
                }
            });

            memoryGraph.render();

            // Disk
            var transformedAppsUsed = data[3].datapoints.map(function (point) { return { y: point[0], x: point[1] } });
            var transformedDataUsed = data[4].datapoints.map(function (point) { return { y: point[0], x: point[1] } });

            var diskGraph = new Rickshaw.Graph({
                element: document.querySelector('#' + activeTab + 'DiskChart'),
                renderer: 'area',
                width: 580,
                height: 250,
                min: 0,
                max: 30 * 1024 * 1024 * 1024, // 30gb
                series: [{
                    color: 'steelblue',
                    data: transformedAppsUsed,
                    name: 'apps'
                }, {
                    color: 'green',
                    data: transformedDataUsed,
                    name: 'data'
                }]
            } );

            var diskXAxis = new Rickshaw.Graph.Axis.Time({ graph: diskGraph });
            var diskYAxis = new Rickshaw.Graph.Axis.Y({
                graph: diskGraph,
                orientation: 'left',
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
                element: document.getElementById(activeTab + 'DiskYAxis'),
            });

            var diskHoverDetail = new Rickshaw.Graph.HoverDetail({
                graph: diskGraph,
                formatter: function(series, x, y) {
                    var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                    var content = swatch + series.name + ": " + new Number(y/(1024 * 1024 * 1024)).toFixed(2) + 'GB<br>';
                    return content;
                }
            });

            var diskLegend = new Rickshaw.Graph.Legend({
                graph: diskGraph,
                element: document.getElementById(activeTab + 'DiskLegend')
            });

            diskGraph.render();
        });
    };

    Client.onReady(function () {

        Client.getApp($routeParams.appId, function (error, app) {
            if (error) {
                console.error(error);
                window.location.href = '#/';
                return;
            }

            $scope.app = app;
            $scope.appLogUrl = Client.getAppLogUrl(app.id);

            if (Client.getConfig().update && Client.getConfig().update.apps) {
                $scope.updateAvailable = Client.getConfig().update.apps.some(function (x) {
                    return x.appId === $scope.app.appStoreId && x.version !== $scope.app.version;
                });
            }

            $scope.updateGraphs();

            $scope.initialized = true;
        });
    });
};
