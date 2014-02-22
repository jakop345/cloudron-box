'use strict';

var SplashController = function ($scope, Client) {
    console.debug('SplashController');

    if (localStorage.server) {
        if (localStorage.token) {
            Client.tokenLogin(localStorage.token, function (error, token) {
                if (error) {
                    console.error('Unable to login', error);
                    window.location.href = '#/discovery';
                    return;
                }

                console.debug('Successfully logged in got token', token);

                // update token
                localStorage.token = token;
                window.location.href = '#/maintabview';
            });
        } else {
            window.location.href = '#/login';
        }
    } else {
        window.location.href = '#/advancedconnection';
    }
};
