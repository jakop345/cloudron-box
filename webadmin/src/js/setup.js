'use strict';

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'angular-md5', 'ui-notification']);

app.directive('ngEnter', function () {
    return function (scope, element, attrs) {
        element.bind('keydown keypress', function (event) {
            if(event.which === 13) {
                scope.$apply(function (){
                    scope.$eval(attrs.ngEnter);
                });
            }
        });
    };
});

// setup all major application routes
app.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
        redirectTo: '/step1'
    }).when('/step1', {
        controller: 'StepController',
        templateUrl: 'views/setup/step1.html'
    }).when('/step2', {
        controller: 'StepController',
        templateUrl: 'views/setup/step2.html'
    }).when('/step3', {
        controller: 'FinishController',
        templateUrl: 'views/setup/step3.html'
    }).otherwise({ redirectTo: '/'});
}]);

app.service('Wizard', [ function () {
    var instance = null;

    function Wizard() {
        this.username = '';
        this.email = '';
        this.password = '';
    }

    instance = new Wizard();
    return instance;
}]);

app.controller('StepController', ['$scope', '$location', 'Wizard', function ($scope, $location, Wizard) {
    $scope.wizard = Wizard;

    $scope.ok = function (page, bad) {
        if (!bad) $location.path(page);
    };

    $scope.$on('$viewContentLoaded', function () {
        $('input[autofocus]').focus();
    });
}]);

app.controller('FinishController', ['$scope', '$location', '$timeout', 'Wizard', 'Client', function ($scope, $location, $timeout, Wizard, Client) {
    $scope.wizard = Wizard;

    function finish() {
        Client.createAdmin($scope.wizard.username, $scope.wizard.password, $scope.wizard.email, $scope.setupToken, function (error) {
            if (error) {
                console.error('Internal error', error);
                window.location.href = '/error.html';
                return;
            }

            window.location.href = '/';
        });
    }

    $timeout(finish, 3000);
}]);

app.controller('SetupController', ['$scope', '$location', 'Client', 'Wizard', function ($scope, $location, Client, Wizard) {
    $scope.initialized = false;

    // Stupid angular location provider either wants html5 location mode or not, do the query parsing on my own
    var search = decodeURIComponent(window.location.search).slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});

    if (!search.setupToken) return window.location.href = '/error.html?errorCode=2';
    $scope.setupToken = search.setupToken;

    if (!search.email) return window.location.href = '/error.html?errorCode=3';
    Wizard.email = search.email;

    Wizard.fqdn = window.location.host;

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            window.location.href = '/error.html';
            return;
        }

        if (!isFirstTime) {
            window.location.href = '/';
            return;
        }

        if (!Wizard.username) $location.path('/step1');

        $scope.initialized = true;

    });
}]);
