'use strict';

var SplashController = function ($scope, Client, Spinner) {
    var spinner = new Spinner().spin();
    spinner.el.style.left = '50%';
    spinner.el.style.top = '50%';
    document.getElementById('spinner-container').appendChild(spinner.el);
};
