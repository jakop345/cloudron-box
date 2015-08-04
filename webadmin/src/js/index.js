'use strict';

/* global angular:false */

// deal with accessToken in the query, this is passed for example on password reset
var search = decodeURIComponent(window.location.search).slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});
if (search.accessToken) localStorage.token = search.accessToken;

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'ngSanitize', 'angular-md5', 'slick', 'ui-notification']);

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
    }).when('/appstore/:appId', {
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
    }).when('/settings', {
        controller: 'SettingsController',
        templateUrl: 'views/settings.html'
    }).when('/support', {
        controller: 'SupportController',
        templateUrl: 'views/support.html'
    }).when('/upgrade', {
        controller: 'UpgradeController',
        templateUrl: 'views/upgrade.html'
    }).otherwise({ redirectTo: '/'});
}]);

// keep in sync with appdb.js
var ISTATES = {
    PENDING_INSTALL: 'pending_install',
    PENDING_CONFIGURE: 'pending_configure',
    PENDING_UNINSTALL: 'pending_uninstall',
    PENDING_RESTORE: 'pending_restore',
    PENDING_UPDATE: 'pending_update',
    PENDING_FORCE_UPDATE: 'pending_force_update',
    PENDING_BACKUP: 'pending_backup',
    ERROR: 'error',
    INSTALLED: 'installed'
};
var HSTATES = {
    HEALTHY: 'healthy',
    UNHEALTHY: 'unhealthy',
    ERROR: 'error',
    DEAD: 'dead'
};

app.filter('installError', function () {
    return function (app) {
        if (app.installationState === ISTATES.ERROR) return true;
        if (app.installationState === ISTATES.INSTALLED) {
            // app.health can also be null to indicate insufficient data
            if (app.health === HSTATES.UNHEALTHY || app.health === HSTATES.ERROR || app.health === HSTATES.DEAD) return true;
        }

        return false;
    };
});

app.filter('installSuccess', function () {
    return function (app) {
        return app.installationState === ISTATES.INSTALLED;
    };
});

app.filter('installationActive', function () {
    return function(app) {
        if (app.installationState === ISTATES.ERROR) return false;
        if (app.installationState === ISTATES.INSTALLED) return false;
        return true;
    };
});

app.filter('installationStateLabel', function() {
    return function(app) {
        var waiting = app.progress === 0 ? ' (Waiting)' : '';

        switch (app.installationState) {
        case ISTATES.PENDING_INSTALL: return 'Installing...' + waiting;
        case ISTATES.PENDING_CONFIGURE: return 'Configuring...' + waiting;
        case ISTATES.PENDING_UNINSTALL: return 'Uninstalling...' + waiting;
        case ISTATES.PENDING_RESTORE: return 'Restoring...' + waiting;
        case ISTATES.PENDING_UPDATE: return 'Updating...' + waiting;
        case ISTATES.PENDING_FORCE_UPDATE: return 'Updating...' + waiting;
        case ISTATES.PENDING_BACKUP: return 'Backing up...' + waiting;
        case ISTATES.ERROR: return 'Error';
        case ISTATES.INSTALLED: {
            if (app.runState === 'running') {
                if (!app.health) return 'Starting...'; // no data yet
                if (app.health === HSTATES.HEALTHY) return 'Running';
                return 'Not responding'; // dead/exit/unhealthy
            } else if (app.runState === 'pending_start') return 'Starting...';
            else if (app.runState === 'pending_stop') return 'Stopping...';
            else if (app.runState === 'stopped') return 'Stopped';
            else return app.runState;
            break;
        }
        default: return app.installationState;
        }
    };
});

app.filter('readyToUpdate', function () {
    return function (apps) {
        return apps.every(function (app) {
            return (app.installationState === ISTATES.ERROR) || (app.installationState === ISTATES.INSTALLED);
        });
    };
});

app.filter('inProgressApps', function () {
    return function (apps) {
        return apps.filter(function (app) {
            return app.installationState !== ISTATES.ERROR && app.installationState !== ISTATES.INSTALLED;
        });
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

app.filter('prettyDate', function () {
    // http://ejohn.org/files/pretty.js
    return function prettyDate(time) {
        var date = new Date(time),
            diff = (((new Date()).getTime() - date.getTime()) / 1000) + 30, // add 30seconds for clock skew
            day_diff = Math.floor(diff / 86400);

        if (isNaN(day_diff) || day_diff < 0 || day_diff >= 31)
            return;

        return day_diff == 0 && (
                diff < 60 && 'just now' ||
                diff < 120 && '1 minute ago' ||
                diff < 3600 && Math.floor( diff / 60 ) + ' minutes ago' ||
                diff < 7200 && '1 hour ago' ||
                diff < 86400 && Math.floor( diff / 3600 ) + ' hours ago') ||
            day_diff == 1 && 'Yesterday' ||
            day_diff < 7 && day_diff + ' days ago' ||
            day_diff < 31 && Math.ceil( day_diff / 7 ) + ' weeks ago';
    };
});

app.filter('markdown2html', function () {
    var converter = new showdown.Converter();

    return function (text) {
        return converter.makeHtml(text);
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
