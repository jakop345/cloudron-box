/* exported Controller */

'use strict';

// create main application module
angular.module('Application', ['ngAnimate']);

var Controller = function ($scope, $http, $interval) {

    var interval = null;

    function reloadPage() {
        $interval.cancel(interval);
        setTimeout(location.reload.bind(location, true /* forceGet from server */), 1000);
    }

    function loadWebadmin() {
        window.location.href = '/';
    }

    function fetchProgress() {
        $http.get('/progress.json').success(function(data, status) {
            if (status === 404) return reloadPage(); // sometimes we miss '100%'
            if (status !== 200 || typeof data !== 'object') return console.error(status, data);
            if (data.progress === '100') return reloadPage();

            $('#updateProgressBar').css('width', data.progress + '%');
            $('#updateProgressMessage').html(data.message);
        }).error(function (data, status) {
            console.error(status, data);
        });
    }

    function fetchConfig(callback) {
        $http.defaults.headers.common.Authorization = 'Bearer ' + localStorage.token;
        $http.get('/api/v1/cloudron/config').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new Error('Got ' + status + '. ' + data));
            callback(null, data.isUpdating);
        }).error(function (data, status) {
            callback(new Error('Got ' + status + '. ' + data));
        });
    }

    function refresh() {
        if (localStorage.token) {
            fetchConfig(function (error, isUpdating) {
                if (error || isUpdating) fetchProgress();
                else if (!isUpdating) loadWebadmin();
                else reloadPage();
            });
        } else {
            fetchProgress();
        }
    }

    interval = $interval(refresh, 2000);

    refresh();
};
