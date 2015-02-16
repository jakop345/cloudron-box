'use strict';

// create main application module
var app = angular.module('Application', []);

app.controller('Controller', ['$scope', '$http', '$interval', function ($scope, $http, $interval) {

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
}]);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVwZGF0ZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6InVwZGF0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuLy8gY3JlYXRlIG1haW4gYXBwbGljYXRpb24gbW9kdWxlXG52YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJywgW10pO1xuXG5hcHAuY29udHJvbGxlcignQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRodHRwJywgJyRpbnRlcnZhbCcsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCAkaW50ZXJ2YWwpIHtcblxuICAgIGZ1bmN0aW9uIGxvYWRXZWJhZG1pbigpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnLyc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmV0Y2hQcm9ncmVzcygpIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3Byb2dyZXNzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09IDQwNCkgcmV0dXJuOyAvLyBqdXN0IHdhaXQgdW50aWwgd2UgY3JlYXRlIHRoZSBwcm9ncmVzcy5qc29uIG9uIHRoZSBzZXJ2ZXIgc2lkZVxuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNvbnNvbGUuZXJyb3Ioc3RhdHVzLCBkYXRhKTtcbiAgICAgICAgICAgIGlmIChkYXRhLnVwZGF0ZSA9PT0gbnVsbCkgcmV0dXJuIGxvYWRXZWJhZG1pbigpO1xuXG4gICAgICAgICAgICAkKCcjdXBkYXRlUHJvZ3Jlc3NCYXInKS5jc3MoJ3dpZHRoJywgZGF0YS51cGRhdGUucGVyY2VudCArICclJyk7XG4gICAgICAgICAgICAkKCcjdXBkYXRlUHJvZ3Jlc3NNZXNzYWdlJykuaHRtbChkYXRhLnVwZGF0ZS5tZXNzYWdlKTtcbiAgICAgICAgfSkuZXJyb3IoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihzdGF0dXMsIGRhdGEpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAkaW50ZXJ2YWwoZmV0Y2hQcm9ncmVzcywgMjAwMCk7XG5cbiAgICBmZXRjaFByb2dyZXNzKCk7XG59XSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=