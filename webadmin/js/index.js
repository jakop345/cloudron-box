'use strict';

/* global angular:false */

// create main application module
var app = angular.module('YellowTent', ['acute.select', 'ngRoute', 'ngAnimate', 'ui.bootstrap', 'base64']);

// setup all major application routes
app.config(function ($routeProvider) {
    $routeProvider.when('/', {
        redirectTo: '/dashboard'
    }).when('/dashboard', {
        controller: 'DashboardController',
        templateUrl: 'views/dashboard.html'
    }).when('/usercreate', {
        controller: 'UserCreateController',
        templateUrl: 'views/usercreate.html'
    }).when('/userdelete', {
        controller: 'UserDeleteController',
        templateUrl: 'views/userdelete.html'
    }).when('/userpassword', {
        controller: 'UserPasswordController',
        templateUrl: 'views/userpassword.html'
    }).when('/userlist', {
        controller: 'UserListController',
        templateUrl: 'views/userlist.html'
    }).when('/volumecreate', {
        controller: 'VolumeCreateController',
        templateUrl: 'views/volumecreate.html'
    }).when('/volumedelete', {
        controller: 'VolumeDeleteController',
        templateUrl: 'views/volumedelete.html'
    }).when('/volumeremoveuser', {
        controller: 'VolumeRemoveUserController',
        templateUrl: 'views/volumeremoveuser.html'
    }).when('/volumemount', {
        controller: 'VolumeMountController',
        templateUrl: 'views/volumemount.html'
    }).when('/volumelist', {
        controller: 'VolumeListController',
        templateUrl: 'views/volumelist.html'
    }).when('/volumeunmount', {
        controller: 'VolumeUnmountController',
        templateUrl: 'views/volumeunmount.html'
    }).when('/applist', {
        controller: 'AppListController',
        templateUrl: 'views/applist.html'
    }).when('/myapps', {
        controller: 'MyAppsController',
        templateUrl: 'views/myapps.html'
    }).when('/app/:id/configure', {
        controller: 'AppConfigureController',
        templateUrl: 'views/appconfigure.html'
    }).when('/app/:id/details', {
        controller: 'AppDetailsController',
        templateUrl: 'views/appdetails.html'
    }).when('/settings', {
        controller: 'SettingsController',
        templateUrl: 'views/settings.html'
    }).otherwise({ redirectTo: '/'});
});

app.run(function (acuteSelectService) {
    // Set the template path for all instances
    acuteSelectService.updateSetting('templatePath', '/3rdparty/templates');
});

app.filter('installationActive', function() {
    return function(input) {
        if (input === 'error') return false;
        if (input === 'installed') return false;
        return true;
    };
});