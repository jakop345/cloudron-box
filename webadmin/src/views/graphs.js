/* global:Rickshaw:true */

'use strict';

angular.module('Application').controller('GraphsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.diskUsage = {};
    $scope.activeApp = null;

    $scope.installedApps = Client.getInstalledApps();

    function bytesToGigaBytes(value) {
        return (value/1024/1024/1024).toFixed(2);
    }

    function renderDisk(type, free, reserved, used) {
        console.log(type, free, reserved, used);

        $scope.diskUsage[type] = {
            used: bytesToGigaBytes(used.datapoints[0][0]),
            reserved: bytesToGigaBytes(reserved.datapoints[0][0]),
            free: bytesToGigaBytes(free.datapoints[0][0]),
            sum: bytesToGigaBytes(used.datapoints[0][0] + reserved.datapoints[0][0] + free.datapoints[0][0])
        };

        var tmp = [{
            value: $scope.diskUsage[type].used,
            color: "#2196F3",
            highlight: "#82C4F8",
            label: "Used"
        }, {
            value: $scope.diskUsage[type].reserved,
            color: "#f0ad4e",
            highlight: "#F8D9AC",
            label: "Reserved"
        }, {
            value: $scope.diskUsage[type].free,
            color:"#27CE65",
            highlight: "#76E59F",
            label: "Free"
        }];

        var ctx = $('#' + type + 'DiskUsageChart').get(0).getContext('2d');
        var myChart = new Chart(ctx);
        myChart.Doughnut(tmp);
    }

    $scope.setMemoryApp = function (app) {
        Client.graphs(['averageSeries(collectd.localhost.table-' + app.id + '-memory.gauge-rss)'], '-2h', function (error, data) {
            if (error) return console.log(error);

            console.log(data);

            // var buckets = [];
            // var timestamp = Date.now() - 24 * 60 * 60;

            // data.datapoints.forEach(function (d) {
            //     if (d[1] <)
            // })

            var foo = data[0].datapoints.map(function (d) { return (d[0] || 0); });

            var tmp = {
                labels: ['-2h', '-1.5h', '-1h', '-0.5h', 'Now'],
                datasets: [{
                    label: 'Memory',
                    fillColor: "#82C4F8",
                    strokeColor: "#2196F3",
                    pointColor: "rgba(151,187,205,1)",
                    pointStrokeColor: "#ffffff",
                    pointHighlightFill: "#82C4F8",
                    pointHighlightStroke: "#82C4F8",
                    // data: [28, 48, 40, 19, 86, 27, 90]
                    data: foo
                }]
            };

            var ctx = $('#memoryAppChart').get(0).getContext('2d');
            var myChart = new Chart(ctx);
            myChart.Line(tmp);
        });
    };

    $scope.updateDiskGraphs = function () {
        Client.graphs([
            'averageSeries(collectd.localhost.df-loop0.df_complex-free)',
            'averageSeries(collectd.localhost.df-loop0.df_complex-reserved)',
            'averageSeries(collectd.localhost.df-loop0.df_complex-used)',

            'averageSeries(collectd.localhost.df-loop1.df_complex-free)',
            'averageSeries(collectd.localhost.df-loop1.df_complex-reserved)',
            'averageSeries(collectd.localhost.df-loop1.df_complex-used)',

            'averageSeries(collectd.localhost.df-vda1.df_complex-free)',
            'averageSeries(collectd.localhost.df-vda1.df_complex-reserved)',
            'averageSeries(collectd.localhost.df-vda1.df_complex-used)',
        ], '-1min', function (error, data) {
            if (error) return console.log(error);

            renderDisk('docker', data[0], data[1], data[2]);
            renderDisk('box', data[3], data[4], data[5]);
            renderDisk('cloudron', data[6], data[7], data[8]);
        });
    };

    Client.onReady($scope.updateDiskGraphs);
}]);
