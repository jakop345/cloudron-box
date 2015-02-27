'use strict';

/* global angular:false */

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'angular-md5']);

// setup all major application routes
app.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
        redirectTo: '/apps'
    }).when('/userpassword', {
        controller: 'UserPasswordController',
        templateUrl: 'views/userpassword.html'
    }).when('/userlist', {
        controller: 'UserListController',
        templateUrl: 'views/userlist.html'
    }).when('/appstore', {
        controller: 'AppStoreController',
        templateUrl: 'views/appstore.html'
    }).when('/apps', {
        controller: 'AppListController',
        templateUrl: 'views/applist.html'
    }).when('/dns', {
        controller: 'DnsController',
        templateUrl: 'views/dns.html'
    }).when('/account', {
        controller: 'AccountController',
        templateUrl: 'views/account.html'
    }).when('/graphs', {
        controller: 'GraphsController',
        templateUrl: 'views/graphs.html'
    }).when('/security', {
        controller: 'SecurityController',
        templateUrl: 'views/security.html'
    }).otherwise({ redirectTo: '/'});
}]);

app.filter('installationActive', function() {
    return function(input) {
        if (input === 'error') return false;
        if (input === 'installed') return false;
        return true;
    };
});

app.filter('installationStateLabel', function() {
    return function(input) {
        if (input === 'error') return 'Error';
        if (input === 'subdomain_error') return 'Error';
        if (input === 'installed') return 'Installed';
        if (input === 'downloading_image') return 'Downloading';
        if (input === 'pending_install') return 'Installing';
        if (input === 'pending_uninstall') return 'Uninstalling';
        if (input === 'creating_container') return 'Container';
        if (input === 'downloading_manifest') return 'Manifest';
        if (input === 'creating_volume') return 'Volume';
        if (input === 'registering_subdomain') return 'Subdomain';
        if (input === 'allocated_oauth_credentials') return 'OAuth';

        return input;
    };
});

app.filter('accessRestrictionLabel', function() {
    return function(input) {
        if (input === '') return 'public';
        if (input === 'roleUser') return 'private';
        if (input === 'roleAdmin') return 'private (Admins only)';

        return input;
    };
});

// custom directive for dynamic names in forms
// See http://stackoverflow.com/questions/23616578/issue-registering-form-control-with-interpolated-name#answer-23617401
app.directive('laterName', function () {                   // (2)
    return {
        restrict: 'A',
        require: ['?ngModel', '^?form'],                   // (3)
        link: function postLink(scope, elem, attrs, ctrls) {
            attrs.$set('name', attrs.laterName);

            var modelCtrl = ctrls[0];                      // (3)
            var formCtrl  = ctrls[1];                      // (3)
            if (modelCtrl && formCtrl) {
                modelCtrl.$name = attrs.name;              // (4)
                formCtrl.$addControl(modelCtrl);           // (2)
                scope.$on('$destroy', function () {
                    formCtrl.$removeControl(modelCtrl);    // (5)
                });
            }
        }
    };
});