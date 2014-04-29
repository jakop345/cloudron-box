'use strict';

var AppsController = function ($scope, $http, config) {
    console.debug('AppsController');

    $scope.refresh = function () {
        $http.get(config.APPSTORE_URL + '/api/v1/apps')
            .success(function (data, status, headers, config) {
                console.log(data);
                $scope.apps = data.apps;
            }).error(function (data, status, headers, config) {
                console.log('error in getting app list');
            });
    };

    $scope.installAll = function (appId) {
        console.log('Will install ', appId);
    };

    $scope.refresh();
/*
    $scope.apps = [
        { id: 1, title: 'Title', author: 'Author', icon: 'http://lorempixel.com/100/100/' },
        { id: 2, title: 'Title', author: 'Author', icon: 'http://lorempixel.com/100/100/' },
        { id: 3, title: 'Title', author: 'Author', icon: 'http://lorempixel.com/100/100/' },
        { id: 4, title: 'Title', author: 'Author', icon: 'http://lorempixel.com/100/100/' }
    ];
*/
};
