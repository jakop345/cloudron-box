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
        $scope.activeApp = app;

        var target;
        if (app === 'system') target = 'averageSeries(collectd.localhost.memory.memory-used)';
        else target = 'averageSeries(collectd.localhost.table-' + app.id + '-memory.gauge-rss)';

        Client.graphs([target], '-2h', function (error, data) {
            if (error) return console.log(error);

            console.log(data);

            var buckets = [];
            var timeBuckets = 8;
            var duration = 2 * 60 * 60;
            var timeBucketSlice = duration / timeBuckets;
            var timestampBegin = (Date.now()/1000).toFixed() - duration;  // we use seconds, not ms

            data[0].datapoints.forEach(function (d) {
                var offset = d[1] - timestampBegin;
                offset = offset <= 0 ? 1 : offset;

                var bucket = parseInt((offset / timeBucketSlice).toFixed(0));

                if (!buckets[bucket]) buckets[bucket] = [];
                buckets[bucket].push(d[0]);
            });

            // now calculate the average
            var foo = buckets.map(function (d) {
                return d.reduce(function (sum, a) { return sum + a; }, 0) / (d.length !== 0 ? d.length : 1);
            }).map(function (d) { return parseInt((d/1024/1024).toFixed(2)); });

            var labels = buckets.map(function (d, index) { return (duration - (index * timeBucketSlice)) / 60 / 60 + 'h'; });

            var tmp = {
                labels: labels,
                datasets: [{
                    label: 'Memory',
                    fillColor: "#82C4F8",
                    strokeColor: "#2196F3",
                    pointColor: "rgba(151,187,205,1)",
                    pointStrokeColor: "#ffffff",
                    pointHighlightFill: "#82C4F8",
                    pointHighlightStroke: "#82C4F8",
                    data: foo
                }]
            };

            var ctx = $('#memoryAppChart').get(0).getContext('2d');
            var myChart = new Chart(ctx);

            var options = {
                scaleOverride: true,
                scaleSteps: 10,
                scaleStepWidth: $scope.activeApp === 'system' ? 100 : 10,
                scaleStartValue: 0
            };

            myChart.Line(tmp, options);
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
    Client.onReady($scope.setMemoryApp.bind(null, 'system'));
}]);
