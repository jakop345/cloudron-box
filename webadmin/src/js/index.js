'use strict';

/* global angular:false */

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'angular-md5']);

// setup all major application routes
app.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
        redirectTo: '/apps'
    }).when('/users', {
        controller: 'UsersController',
        templateUrl: 'views/users.html'
    }).when('/appstore', {
        controller: 'AppStoreController',
        templateUrl: 'views/appstore.html'
    }).when('/apps', {
        controller: 'AppsController',
        templateUrl: 'views/apps.html'
    }).when('/dns', {
        controller: 'DnsController',
        templateUrl: 'views/dns.html'
    }).when('/account', {
        controller: 'AccountController',
        templateUrl: 'views/account.html'
    }).when('/graphs', {
        controller: 'GraphsController',
        templateUrl: 'views/graphs.html'
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
    // keep in sync with appdb.js
    var ISTATE_PENDING_INSTALL = 'pending_install';
    var ISTATE_PENDING_CONFIGURE = 'pending_configure';
    var ISTATE_PENDING_UNINSTALL = 'pending_uninstall';
    var ISTATE_PENDING_RESTORE = 'pending_restore';
    var ISTATE_PENDING_UPDATE = 'pending_update';
    var ISTATE_ERROR = 'error';
    var ISTATE_INSTALLED = 'installed';

    return function(input) {
        switch (input) {
        case ISTATE_PENDING_INSTALL: return 'Installing';
        case ISTATE_PENDING_CONFIGURE: return 'Configuring';
        case ISTATE_PENDING_UNINSTALL: return 'Uninstalling';
        case ISTATE_PENDING_RESTORE: return 'Starting';
        case ISTATE_PENDING_UPDATE: return 'Updating';
        case ISTATE_ERROR: return 'Error';
        case ISTATE_INSTALLED: return 'Running';
        default: return input;
        }
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
