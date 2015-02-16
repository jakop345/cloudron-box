/* exported Controller */

'use strict';

// create main application module
angular.module('Application', []);

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVwZGF0ZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJ1cGRhdGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiBleHBvcnRlZCBDb250cm9sbGVyICovXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gY3JlYXRlIG1haW4gYXBwbGljYXRpb24gbW9kdWxlXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nLCBbXSk7XG5cbnZhciBDb250cm9sbGVyID0gZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsICRpbnRlcnZhbCkge1xuXG4gICAgZnVuY3Rpb24gbG9hZFdlYmFkbWluKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmZXRjaFByb2dyZXNzKCkge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vcHJvZ3Jlc3MnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gNDA0KSByZXR1cm47IC8vIGp1c3Qgd2FpdCB1bnRpbCB3ZSBjcmVhdGUgdGhlIHByb2dyZXNzLmpzb24gb24gdGhlIHNlcnZlciBzaWRlXG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY29uc29sZS5lcnJvcihzdGF0dXMsIGRhdGEpO1xuICAgICAgICAgICAgaWYgKGRhdGEudXBkYXRlID09PSBudWxsKSByZXR1cm4gbG9hZFdlYmFkbWluKCk7XG5cbiAgICAgICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc0JhcicpLmNzcygnd2lkdGgnLCBkYXRhLnVwZGF0ZS5wZXJjZW50ICsgJyUnKTtcbiAgICAgICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc01lc3NhZ2UnKS5odG1sKGRhdGEudXBkYXRlLm1lc3NhZ2UpO1xuICAgICAgICB9KS5lcnJvcihmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKHN0YXR1cywgZGF0YSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgICRpbnRlcnZhbChmZXRjaFByb2dyZXNzLCAyMDAwKTtcblxuICAgIGZldGNoUHJvZ3Jlc3MoKTtcbn07XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=