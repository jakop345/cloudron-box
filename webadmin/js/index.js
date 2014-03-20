'use strict';

/* global angular:false */

// create main application module
var app = angular.module('YellowTent', ['ngRoute', 'ngAnimate', 'ui.bootstrap', 'base64', 'clientService', 'spinnerFactory']);

// setup all major application routes
app.config(function ($routeProvider) {
    $routeProvider.when('/', {
        controller: 'SplashController',
        templateUrl: 'partials/splash.html'
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
    }).when('/volumemount', {
        controller: 'VolumeMountController',
        templateUrl: 'partials/volumemount.html'
    }).when('/volumelist', {
        controller: 'VolumeListController',
        templateUrl: 'partials/volumelist.html'
    }).when('/volumeunmount', {
        controller: 'VolumeUnmountController',
        templateUrl: 'partials/volumeunmount.html'
    }).when('/settings', {
        controller: 'SettingsController',
        templateUrl: 'partials/settings.html'
    }).otherwise({ redirectTo: '/'});
});
