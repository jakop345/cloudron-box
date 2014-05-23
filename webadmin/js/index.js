'use strict';

/* global angular:false */

// create main application module
var app = angular.module('YellowTent', ['acute.select', 'ngRoute', 'ngAnimate', 'ui.bootstrap', 'base64', 'clientService', 'spinnerFactory']);

// setup all major application routes
app.config(function ($routeProvider) {
    $routeProvider.when('/', {
        controller: 'LoginController',
        templateUrl: 'partials/login.html'
    }).when('/login', {
        controller: 'LoginController',
        templateUrl: 'partials/login.html'
    }).when('/usercreate', {
        controller: 'UserCreateController',
        templateUrl: 'partials/usercreate.html'
    }).when('/userdelete', {
        controller: 'UserDeleteController',
        templateUrl: 'partials/userdelete.html'
    }).when('/userpassword', {
        controller: 'UserPasswordController',
        templateUrl: 'partials/userpassword.html'
    }).when('/userlist', {
        controller: 'UserListController',
        templateUrl: 'partials/userlist.html'
    }).when('/volumecreate', {
        controller: 'VolumeCreateController',
        templateUrl: 'partials/volumecreate.html'
    }).when('/volumedelete', {
        controller: 'VolumeDeleteController',
        templateUrl: 'partials/volumedelete.html'
    }).when('/volumeremoveuser', {
        controller: 'VolumeRemoveUserController',
        templateUrl: 'partials/volumeremoveuser.html'
    }).when('/volumemount', {
        controller: 'VolumeMountController',
        templateUrl: 'partials/volumemount.html'
    }).when('/volumelist', {
        controller: 'VolumeListController',
        templateUrl: 'partials/volumelist.html'
    }).when('/volumeunmount', {
        controller: 'VolumeUnmountController',
        templateUrl: 'partials/volumeunmount.html'
    }).when('/applist', {
        controller: 'AppListController',
        templateUrl: 'partials/applist.html'
    }).when('/myapps', {
        controller: 'MyAppsController',
        templateUrl: 'partials/myapps.html'
    }).when('/app/:id/configure', {
        controller: 'AppConfigureController',
        templateUrl: 'partials/appconfigure.html'
    }).when('/settings', {
        controller: 'SettingsController',
        templateUrl: 'partials/settings.html'
    }).otherwise({ redirectTo: '/'});
});

app.run(function (acuteSelectService) {
    // Set the template path for all instances
    acuteSelectService.updateSetting('templatePath', '/3rdparty/templates');
});

app.service('config', function () {
    this.APPSTORE_URL = 'http://localhost:5050';
});

