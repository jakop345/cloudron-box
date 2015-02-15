/* exported Controller */

'use strict';

// create main application module
angular.module('Application', ['ngAnimate']);

var Controller = function ($scope, $http, $interval) {

    function loadWebadmin() {
        window.location.href = '/';
    }

    function fetchProgress() {
        $http.get('/api/v1/cloudron/progress').success(function(data, status) {
            if (status === 404) return; // just wait until we create the progress.json on the server side
            if (status !== 200 || typeof data !== 'object') return console.error(status, data);
            if (data.update === null) return loadWebadmin();

            $('#updateProgressBar').css('width', data.update.percent + '%');
            $('#updateProgressMessage').html(data.update.message);
        }).error(function (data, status) {
            console.error(status, data);
        });
    }

    $interval(fetchProgress, 2000);

    fetchProgress();
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVwZGF0ZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJ1cGRhdGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBleHBvcnRlZCBDb250cm9sbGVyICovXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gY3JlYXRlIG1haW4gYXBwbGljYXRpb24gbW9kdWxlXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nLCBbJ25nQW5pbWF0ZSddKTtcblxudmFyIENvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCAkaHR0cCwgJGludGVydmFsKSB7XG5cbiAgICBmdW5jdGlvbiBsb2FkV2ViYWRtaW4oKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy8nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZldGNoUHJvZ3Jlc3MoKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9wcm9ncmVzcycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSA0MDQpIHJldHVybjsgLy8ganVzdCB3YWl0IHVudGlsIHdlIGNyZWF0ZSB0aGUgcHJvZ3Jlc3MuanNvbiBvbiB0aGUgc2VydmVyIHNpZGVcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjb25zb2xlLmVycm9yKHN0YXR1cywgZGF0YSk7XG4gICAgICAgICAgICBpZiAoZGF0YS51cGRhdGUgPT09IG51bGwpIHJldHVybiBsb2FkV2ViYWRtaW4oKTtcblxuICAgICAgICAgICAgJCgnI3VwZGF0ZVByb2dyZXNzQmFyJykuY3NzKCd3aWR0aCcsIGRhdGEudXBkYXRlLnBlcmNlbnQgKyAnJScpO1xuICAgICAgICAgICAgJCgnI3VwZGF0ZVByb2dyZXNzTWVzc2FnZScpLmh0bWwoZGF0YS51cGRhdGUubWVzc2FnZSk7XG4gICAgICAgIH0pLmVycm9yKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3Ioc3RhdHVzLCBkYXRhKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgJGludGVydmFsKGZldGNoUHJvZ3Jlc3MsIDIwMDApO1xuXG4gICAgZmV0Y2hQcm9ncmVzcygpO1xufTtcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==