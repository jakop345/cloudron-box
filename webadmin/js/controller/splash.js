'use strict';

var SplashController = function ($scope, Client, Spinner) {
    console.debug('SplashController');

    var spinner = new Spinner().spin();
    spinner.el.style.left = '50%';
    spinner.el.style.top = '50%';
    document.getElementById('spinner-container').appendChild(spinner.el);

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            console.error('Unable to connect.', error);
            return;
        }

        console.debug('Successfully connect to server. Server first time', isFirstTime);

        if (isFirstTime) {
            window.location.href = '#/usercreate?admin=1';
            return;
        }

        // Server already initializied, try to perform login based on token
        if (localStorage.token) {
            Client.tokenLogin(localStorage.token, function (error, token) {
                if (error) {
                    console.error('Unable to login', error);
                    window.location.href = '#/login';
                    return;
                }

                console.debug('Successfully logged in got token', token);

                // update token
                localStorage.token = token;
                window.location.href = '#/volumelist';
            });
            return;
        }

        // No token plain login
        window.location.href = '#/login';
    });
};
