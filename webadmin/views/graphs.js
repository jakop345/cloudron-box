/* exported GraphsController */
/* global $:true */

'use strict';

var GraphsController = function ($scope, Client) {
    $scope.activeTab = 'day';

    var cpuUsageTarget = 'transformNull(' +
    'scale(divideSeries(' +
        'sumSeries(collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user),' +
        'sumSeries(collectd.localhost.cpu-0.cpu-idle,collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user,collectd.localhost.cpu-0.cpu-wait)), 100), 0)';

    var networkUsageTxTarget = 'collectd.localhost.interface-eth0.if_octets.tx';
    var networkUsageRxTarget = 'collectd.localhost.interface-eth0.if_octets.rx';

    var diskUsageAppsUsedTarget = 'collectd.localhost.df-loop0.df_complex-used';
    var diskUsageDataUsedTarget = 'collectd.localhost.df-loop1.df_complex-used';

    $scope.updateGraphs = function () {
        Client.graphs([ cpuUsageTarget, networkUsageTxTarget, networkUsageRxTarget, diskUsageAppsUsedTarget, diskUsageDataUsedTarget ], '-12hours', function (error, data) {
            if (error) return console.log(error);

            var transformed = data[0].datapoints.map(function (point) { return { y: point[0], x: point[1] } });

            var graph = new Rickshaw.Graph({
                element: document.querySelector("#cpuChart"),
                renderer: 'line',
                width: 580,
                height: 250,
                min: 0,
                max: 100,
                series: [ {
                    color: 'steelblue',
                    data: transformed,
                    name: 'cpu'
                } ]
            });

            var xAxis = new Rickshaw.Graph.Axis.Time({ graph: graph });

            var yAxis = new Rickshaw.Graph.Axis.Y( {
                graph: graph,
                orientation: 'left',
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
                element: document.getElementById('cpuYAxis'),
            });

            var hoverDetail = new Rickshaw.Graph.HoverDetail( {
                graph: graph,
                formatter: function(series, x, y) {
                    // var date = '<span class="date">' + new Date(x * 1000).toUTCString() + '</span>';
                    var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                    var content = swatch + series.name + ": " + new Number(y).toFixed(2) + '%<br>';
                    return content;
                }
            });

            graph.render();

            var transformedTx = data[1].datapoints.map(function (point) { return { y: point[0], x: point[1] } });
            var transformedRx = data[2].datapoints.map(function (point) { return { y: point[0], x: point[1] } });

            var graph = new Rickshaw.Graph( {
                element: document.querySelector("#networkChart"),
                renderer: 'line',
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

            var xAxis = new Rickshaw.Graph.Axis.Time( { graph: graph } );

            var yAxis = new Rickshaw.Graph.Axis.Y( {
                graph: graph,
                orientation: 'left',
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
                element: document.getElementById('networkYAxis'),
            });

            var hoverDetail = new Rickshaw.Graph.HoverDetail( {
                graph: graph,
                formatter: function(series, x, y) {
                    // var date = '<span class="date">' + new Date(x * 1000).toUTCString() + '</span>';
                    var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                    var content = swatch + series.name + ": " + new Number(y/1024).toFixed(2) + 'KB<br>';
                    return content;
                }
            });

            graph.render();

            var transformedAppsUsed = data[3].datapoints.map(function (point) { return { y: point[0], x: point[1] } });
            var transformedDataUsed = data[4].datapoints.map(function (point) { return { y: point[0], x: point[1] } });

            var graph = new Rickshaw.Graph( {
                element: document.querySelector("#diskChart"),
                renderer: 'line',
                width: 580,
                height: 250,
                min: 0,
                max: 30 * 1024 * 1024 * 1024, // 30gb
                series: [ {
                    color: 'steelblue',
                    data: transformedAppsUsed,
                    name: 'apps'
                }, {
                    color: 'green',
                    data: transformedDataUsed,
                    name: 'data'
                } ]
            } );

            var xAxis = new Rickshaw.Graph.Axis.Time( { graph: graph } );

            var yAxis = new Rickshaw.Graph.Axis.Y( {
                graph: graph,
                orientation: 'left',
                tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
                element: document.getElementById('diskYAxis'),
            });

            var hoverDetail = new Rickshaw.Graph.HoverDetail( {
                graph: graph,
                formatter: function(series, x, y) {
                    // var date = '<span class="date">' + new Date(x * 1000).toUTCString() + '</span>';
                    var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                    var content = swatch + series.name + ": " + new Number(y/(1024 * 1024 * 1024)).toFixed(2) + 'GB<br>';
                    return content;
                }
            } );

            graph.render();
        });
    };

    Client.onReady($scope.updateGraphs);
};

