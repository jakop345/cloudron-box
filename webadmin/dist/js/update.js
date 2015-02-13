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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVwZGF0ZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoidXBkYXRlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXhwb3J0ZWQgQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbi8vIGNyZWF0ZSBtYWluIGFwcGxpY2F0aW9uIG1vZHVsZVxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJywgWyduZ0FuaW1hdGUnXSk7XG5cbnZhciBDb250cm9sbGVyID0gZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsICRpbnRlcnZhbCkge1xuXG4gICAgdmFyIGludGVydmFsID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIHJlbG9hZFBhZ2UoKSB7XG4gICAgICAgICRpbnRlcnZhbC5jYW5jZWwoaW50ZXJ2YWwpO1xuICAgICAgICBzZXRUaW1lb3V0KGxvY2F0aW9uLnJlbG9hZC5iaW5kKGxvY2F0aW9uLCB0cnVlIC8qIGZvcmNlR2V0IGZyb20gc2VydmVyICovKSwgMTAwMCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZFdlYmFkbWluKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmZXRjaFByb2dyZXNzKCkge1xuICAgICAgICAkaHR0cC5nZXQoJy9wcm9ncmVzcy5qc29uJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09IDQwNCkgcmV0dXJuIHJlbG9hZFBhZ2UoKTsgLy8gc29tZXRpbWVzIHdlIG1pc3MgJzEwMCUnXG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY29uc29sZS5lcnJvcihzdGF0dXMsIGRhdGEpO1xuICAgICAgICAgICAgaWYgKGRhdGEucHJvZ3Jlc3MgPT09ICcxMDAnKSByZXR1cm4gcmVsb2FkUGFnZSgpO1xuXG4gICAgICAgICAgICAkKCcjdXBkYXRlUHJvZ3Jlc3NCYXInKS5jc3MoJ3dpZHRoJywgZGF0YS5wcm9ncmVzcyArICclJyk7XG4gICAgICAgICAgICAkKCcjdXBkYXRlUHJvZ3Jlc3NNZXNzYWdlJykuaHRtbChkYXRhLm1lc3NhZ2UpO1xuICAgICAgICB9KS5lcnJvcihmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKHN0YXR1cywgZGF0YSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZldGNoQ29uZmlnKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmRlZmF1bHRzLmhlYWRlcnMuY29tbW9uLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyBsb2NhbFN0b3JhZ2UudG9rZW47XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9jb25maWcnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBFcnJvcignR290ICcgKyBzdGF0dXMgKyAnLiAnICsgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5pc1VwZGF0aW5nKTtcbiAgICAgICAgfSkuZXJyb3IoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IEVycm9yKCdHb3QgJyArIHN0YXR1cyArICcuICcgKyBkYXRhKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlZnJlc2goKSB7XG4gICAgICAgIGlmIChsb2NhbFN0b3JhZ2UudG9rZW4pIHtcbiAgICAgICAgICAgIGZldGNoQ29uZmlnKGZ1bmN0aW9uIChlcnJvciwgaXNVcGRhdGluZykge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvciB8fCBpc1VwZGF0aW5nKSBmZXRjaFByb2dyZXNzKCk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoIWlzVXBkYXRpbmcpIGxvYWRXZWJhZG1pbigpO1xuICAgICAgICAgICAgICAgIGVsc2UgcmVsb2FkUGFnZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmZXRjaFByb2dyZXNzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbnRlcnZhbCA9ICRpbnRlcnZhbChyZWZyZXNoLCAyMDAwKTtcblxuICAgIHJlZnJlc2goKTtcbn07XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=