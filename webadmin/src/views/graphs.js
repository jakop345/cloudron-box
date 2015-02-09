/* exported GraphsController */
/* global $:true */

'use strict';

var GraphsController = function ($scope, Client) {
    $scope.activeTab = 'day';

    var cpuUsageTarget = 'transformNull(' +
    'scale(divideSeries(' +
        'sumSeries(collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user),' +
        'sumSeries(collectd.localhost.cpu-0.cpu-idle,collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user,collectd.localhost.cpu-0.cpu-wait)), 100), 0)';

    var networkUsageTxTarget = 'transformNull(collectd.localhost.interface-eth0.if_octets.tx, 0)';
    var networkUsageRxTarget = 'transformNull(collectd.localhost.interface-eth0.if_octets.rx, 0)';

    var diskUsageAppsUsedTarget = 'transformNull(collectd.localhost.df-loop0.df_complex-used, 0)';
    var diskUsageDataUsedTarget = 'transformNull(collectd.localhost.df-loop1.df_complex-used, 0)';

    function renderCpu(activeTab, cpuData) {
        var transformedCpu = [ ];

        if (cpuData && cpuData.datapoints) transformedCpu = cpuData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

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
    }

    function renderNetwork(activeTab, txData, rxData) {
        var transformedTx = [ ], transformedRx = [ ];

        if (txData && txData.datapoints) transformedTx = txData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });
        if (rxData && rxData.datapoints) transformedRx = rxData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

        var networkGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'NetworkChart'),
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

        var networkXAxis = new Rickshaw.Graph.Axis.Time({ graph: networkGraph });
        var networkYAxis = new Rickshaw.Graph.Axis.Y({
            graph: networkGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'NetworkYAxis'),
        });

        var networkHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: networkGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y/1024).toFixed(2) + 'KB<br>';
                return content;
            }
        });

        networkGraph.render();
    }

    function renderDisk(activeTab, appsUsedData, dataUsedData) {
        var transformedAppsUsed = [ ], transformedDataUsed = [ ];

        if (appsUsedData && appsUsedData.datapoints) {
            transformedAppsUsed = appsUsedData.datapoints.map(function (point) { return { y: point[0], x: point[1] }; });
        }

        if (dataUsedData && dataUsedData.datapoints) {
            transformedDataUsed = dataUsedData.datapoints.map(function (point) { return { y: point[0], x: point[1] }; });
        }

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
    }

    $scope.updateGraphs = function () {
        var activeTab = $scope.activeTab;
       var from = '-24hours';
        switch (activeTab) {
        case 'day': from = '-24hours'; break;
        case 'month': from = '-1month'; break;
        case 'year': from = '-1year'; break;
        default: console.log('internal errror');
        }

        Client.graphs([ cpuUsageTarget, networkUsageTxTarget, networkUsageRxTarget, diskUsageAppsUsedTarget, diskUsageDataUsedTarget ], from, function (error, data) {
            if (error) return console.log(error);

            renderCpu(activeTab, data[0]);

            renderNetwork(activeTab, data[1], data[2]);

            renderDisk(activeTab, data[3], data[4]);
        });
    };

    Client.onReady($scope.updateGraphs);
};

