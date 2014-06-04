'use strict';

/* global angular:false */

angular.module('YellowTent')
.factory('Spinner', function () {
    var spinner = function () {};

    if (window.Spinner) spinner = window.Spinner;

    return spinner;
});
