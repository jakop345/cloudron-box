'use strict';

/* global angular:false */

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'angular-md5', 'slick', 'ui-notification']);

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

// keep in sync with appdb.js
var ISTATES = {
    ISTATE_PENDING_INSTALL: 'pending_install',
    ISTATE_PENDING_CONFIGURE: 'pending_configure',
    ISTATE_PENDING_UNINSTALL: 'pending_uninstall',
    ISTATE_PENDING_RESTORE: 'pending_restore',
    ISTATE_PENDING_UPDATE: 'pending_update',
    ISTATE_ERROR: 'error',
    ISTATE_INSTALLED: 'installed'
};

app.filter('installationActive', function() {
    return function(inputObject) {
        if (inputObject.installationState === ISTATES.ISTATE_ERROR) return false;
        if (inputObject.installationState === ISTATES.ISTATE_INSTALLED) return false;
        return true;
    };
});

app.filter('installationStateLabel', function() {
    return function(inputObject) {
        switch (inputObject.installationState) {
        case ISTATES.ISTATE_PENDING_INSTALL: return 'Installing';
        case ISTATES.ISTATE_PENDING_CONFIGURE: return 'Configuring';
        case ISTATES.ISTATE_PENDING_UNINSTALL: return 'Uninstalling';
        case ISTATES.ISTATE_PENDING_RESTORE: return 'Starting';
        case ISTATES.ISTATE_PENDING_UPDATE: return 'Updating';
        case ISTATES.ISTATE_ERROR: return 'Error';
        case ISTATES.ISTATE_INSTALLED: return 'Running';
        default: return inputObject.installationState;
        }
    };
});

app.filter('accessRestrictionLabel', function() {
    return function (input) {
        if (input === '') return 'public';
        if (input === 'roleUser') return 'private';
        if (input === 'roleAdmin') return 'private (Admins only)';

        return input;
    };
});

app.filter('prettyHref', function () {
    return function (input) {
        if (!input) return input;
        if (input.indexOf('http://') === 0) return input.slice('http://'.length);
        if (input.indexOf('https://') === 0) return input.slice('https://'.length);
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
