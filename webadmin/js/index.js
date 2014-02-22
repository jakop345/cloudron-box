'use strict';

/* global angular:false */

// create main application module
var app = angular.module('YellowTent', ['ngRoute', 'ngAnimate', 'ui.bootstrap', 'base64', 'clientFactory']);

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
    }).when('/volumecreate', {
        controller: 'VolumeCreateController',
        templateUrl: 'partials/volumecreate.html'
    }).when('/volumedelete', {
        controller: 'VolumeDeleteController',
        templateUrl: 'partials/volumedelete.html'
    }).when('/volumemount', {
        controller: 'VolumeMountController',
        templateUrl: 'partials/volumemount.html'
    }).when('/volumeunmount', {
        controller: 'VolumeUnmountController',
        templateUrl: 'partials/volumeunmount.html'
    }).when('/maintabview', {
        controller: 'MainTabViewController',
        templateUrl: 'partials/maintabview.html'
    }).otherwise({ redirectTo: '/'});
});
