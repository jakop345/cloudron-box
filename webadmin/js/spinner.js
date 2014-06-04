'use strict';

/* global angular:false */

angular.module('spinnerFactory', [])
.factory('Spinner', function () {
    var spinner = function () {};

    if (window.Spinner) spinner = window.Spinner;

    return spinner;
});