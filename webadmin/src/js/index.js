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
    PENDING_INSTALL: 'pending_install',
    PENDING_CONFIGURE: 'pending_configure',
    PENDING_UNINSTALL: 'pending_uninstall',
    PENDING_RESTORE: 'pending_restore',
    PENDING_UPDATE: 'pending_update',
    ERROR: 'error',
    INSTALLED: 'installed'
};
var HSTATES = {
    HEALTHY: 'healthy'
};

app.filter('installError', function () {
    return function (app) {
        return app.installationState === ISTATES.ERROR;
    };
});

app.filter('installSuccess', function () {
    return function (app) {
        return app.installationState === ISTATES.INSTALLED;
    };
});

app.filter('installationActive', function() {
    return function(app) {
        if (app.installationState === ISTATES.ERROR) return false;
        if (app.installationState === ISTATES.INSTALLED) return false;
        return true;
    };
});

app.filter('installationStateLabel', function() {
    return function(app) {
        switch (app.installationState) {
        case ISTATES.PENDING_INSTALL: return 'Installing';
        case ISTATES.PENDING_CONFIGURE: return 'Configuring';
        case ISTATES.PENDING_UNINSTALL: return 'Uninstalling';
        case ISTATES.PENDING_RESTORE: return 'Starting';
        case ISTATES.PENDING_UPDATE: return 'Updating';
        case ISTATES.ERROR: return 'Error';
        case ISTATES.INSTALLED: return app.health !== HSTATES.HEALTHY ? 'Starting' : 'Running';
        default: return app.installationState;
        }
    };
});

app.filter('applicationLink', function() {
    return function(app) {
        if (app.installationState === ISTATES.INSTALLED && app.health === HSTATES.HEALTHY) {
            return 'https://' + app.fqdn;
        } else {
            return '';
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
