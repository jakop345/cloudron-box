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
            callback(null, data.isUpdate);
        }).error(function (data, status) {
            console.error(status, data);
            callback(new Error('Got ' + status + '. ' + data));
        });
    }

    function refresh() {
        if (localStorage.token) {
            fetchConfig(function (error, isUpdate) {
                if (error || isUpdate) fetchProgress();
                else reloadPage();
            });
        } else {
            fetchProgress();
        }
    }

    interval = $interval(refresh, 2000);

    refresh();
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInVwZGF0ZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6InVwZGF0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qIGV4cG9ydGVkIENvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBjcmVhdGUgbWFpbiBhcHBsaWNhdGlvbiBtb2R1bGVcbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicsIFsnbmdBbmltYXRlJ10pO1xuXG52YXIgQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCAkaW50ZXJ2YWwpIHtcblxuICAgIHZhciBpbnRlcnZhbCA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiByZWxvYWRQYWdlKCkge1xuICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKGludGVydmFsKTtcbiAgICAgICAgc2V0VGltZW91dChsb2NhdGlvbi5yZWxvYWQuYmluZChsb2NhdGlvbiwgdHJ1ZSAvKiBmb3JjZUdldCBmcm9tIHNlcnZlciAqLyksIDEwMDApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZldGNoUHJvZ3Jlc3MoKSB7XG4gICAgICAgICRodHRwLmdldCgnL3Byb2dyZXNzLmpzb24nKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gNDA0KSByZXR1cm4gcmVsb2FkUGFnZSgpOyAvLyBzb21ldGltZXMgd2UgbWlzcyAnMTAwJSdcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjb25zb2xlLmVycm9yKHN0YXR1cywgZGF0YSk7XG4gICAgICAgICAgICBpZiAoZGF0YS5wcm9ncmVzcyA9PT0gJzEwMCcpIHJldHVybiByZWxvYWRQYWdlKCk7XG5cbiAgICAgICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc0JhcicpLmNzcygnd2lkdGgnLCBkYXRhLnByb2dyZXNzICsgJyUnKTtcbiAgICAgICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc01lc3NhZ2UnKS5odG1sKGRhdGEubWVzc2FnZSk7XG4gICAgICAgIH0pLmVycm9yKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3Ioc3RhdHVzLCBkYXRhKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmV0Y2hDb25maWcoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZGVmYXVsdHMuaGVhZGVycy5jb21tb24uQXV0aG9yaXphdGlvbiA9ICdCZWFyZXIgJyArIGxvY2FsU3RvcmFnZS50b2tlbjtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL2NvbmZpZycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdHb3QgJyArIHN0YXR1cyArICcuICcgKyBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmlzVXBkYXRlKTtcbiAgICAgICAgfSkuZXJyb3IoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihzdGF0dXMsIGRhdGEpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IEVycm9yKCdHb3QgJyArIHN0YXR1cyArICcuICcgKyBkYXRhKSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlZnJlc2goKSB7XG4gICAgICAgIGlmIChsb2NhbFN0b3JhZ2UudG9rZW4pIHtcbiAgICAgICAgICAgIGZldGNoQ29uZmlnKGZ1bmN0aW9uIChlcnJvciwgaXNVcGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IgfHwgaXNVcGRhdGUpIGZldGNoUHJvZ3Jlc3MoKTtcbiAgICAgICAgICAgICAgICBlbHNlIHJlbG9hZFBhZ2UoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmV0Y2hQcm9ncmVzcygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW50ZXJ2YWwgPSAkaW50ZXJ2YWwocmVmcmVzaCwgMjAwMCk7XG5cbiAgICByZWZyZXNoKCk7XG59O1xuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9