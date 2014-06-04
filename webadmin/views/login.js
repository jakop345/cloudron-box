'use strict';

function LoginController ($scope, Client) {
    // manually tell yellowtent to manage the signInButton
    window.yellowtent.setupButton(document.getElementById('signInButton'), function (authCode) {
        if (!authCode) {
            console.error('User did not finish the OAuth flow.');
            return;
        }

        console.debug('Got authCode as result of OAuth flow.', authCode);

        Client.exchangeCodeForToken(authCode, function (error, accessToken) {
            if (error) {
                console.error('Unable to exchange code for an access token.', error);
                return;
            }

            localStorage.token = accessToken;
            window.location.href = '#/volumelist';
        });
    });
}
