'use strict';

angular.module('Application').controller('AccountController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.activeClients = [];
    $scope.tokenInUse = null;

    $scope.passwordchange = {
        busy: false,
        error: {},
        password: '',
        newPassword: '',
        newPasswordRepeat: '',

        reset: function () {
            $scope.passwordchange.error.password = null;
            $scope.passwordchange.error.newPassword = null;
            $scope.passwordchange.error.newPasswordRepeat = null;
            $scope.passwordchange.password = '';
            $scope.passwordchange.newPassword = '';
            $scope.passwordchange.newPasswordRepeat = '';

            $scope.passwordChangeForm.$setUntouched();
            $scope.passwordChangeForm.$setPristine();
        },

        show: function () {
            $scope.passwordchange.reset();
            $('#passwordChangeModal').modal('show');
        },

        submit: function () {
            $scope.passwordchange.error.password = null;
            $scope.passwordchange.error.newPassword = null;
            $scope.passwordchange.error.newPasswordRepeat = null;
            $scope.passwordchange.busy = true;

            Client.changePassword($scope.passwordchange.password, $scope.passwordchange.newPassword, function (error) {
                $scope.passwordchange.busy = false;

                if (error) {
                    if (error.statusCode === 403) {
                        $scope.passwordchange.error.password = true;
                        $scope.passwordchange.password = '';
                        $('#inputPasswordChangePassword').focus();
                        $scope.passwordChangeForm.password.$setPristine();
                    } else if (error.statusCode === 400) {
                        $scope.passwordchange.error.newPassword = error.message;
                        $scope.passwordchange.newPassword = '';
                        $scope.passwordchange.newPasswordRepeat = '';
                        $scope.passwordChangeForm.newPassword.$setPristine();
                        $scope.passwordChangeForm.newPasswordRepeat.$setPristine();
                        $('#inputPasswordChangeNewPassword').focus();
                    } else {
                        console.error('Unable to change password.', error);
                    }
                    return;
                }

                $scope.passwordchange.reset();
                $('#passwordChangeModal').modal('hide');
            });
        }
    };

    $scope.emailchange = {
        busy: false,
        error: {},
        email: '',

        reset: function () {
            $scope.emailchange.busy = false;
            $scope.emailchange.error.email = null;
            $scope.emailchange.email = '';

            $scope.emailChangeForm.$setUntouched();
            $scope.emailChangeForm.$setPristine();
        },

        show: function () {
            $scope.emailchange.reset();
            $('#emailChangeModal').modal('show');
        },

        submit: function () {
            $scope.emailchange.error.email = null;
            $scope.emailchange.busy = true;

            var user = {
                id: $scope.user.id,
                email: $scope.emailchange.email
            };

            Client.updateUser(user, function (error) {
                $scope.emailchange.busy = false;

                if (error) {
                    console.error('Unable to change email.', error);
                    return;
                }

                // update user info in the background
                Client.refreshUserInfo();

                $scope.emailchange.reset();
                $('#emailChangeModal').modal('hide');
            });
        }
    };

    $scope.displayNameChange = {
        busy: false,
        error: {},
        displayName: '',

        reset: function () {
            $scope.displayNameChange.busy = false;
            $scope.displayNameChange.error.displayName = null;
            $scope.displayNameChange.displayName = '';

            $scope.displayNameChangeForm.$setUntouched();
            $scope.displayNameChangeForm.$setPristine();
        },

        show: function () {
            $scope.displayNameChange.reset();
            $scope.displayNameChange.displayName = $scope.user.displayName;
            $('#displayNameChangeModal').modal('show');
        },

        submit: function () {
            $scope.displayNameChange.error.displayName = null;
            $scope.displayNameChange.busy = true;

            var user = {
                id: $scope.user.id,
                displayName: $scope.displayNameChange.displayName
            };

            Client.updateUser(user, function (error) {
                $scope.displayNameChange.busy = false;

                if (error) {
                    console.error('Unable to change displayName.', error);
                    return;
                }

                // update user info in the background
                Client.refreshUserInfo();

                $scope.displayNameChange.reset();
                $('#displayNameChangeModal').modal('hide');
            });
        }
    };

    $scope.clientAdd = {
        busy: false,
        error: {},
        name: '',
        scope: '',
        redirectURI: '',

        show: function () {
            $scope.clientAdd.busy = false;

            $scope.clientAdd.error = {};
            $scope.clientAdd.name = '';
            $scope.clientAdd.scope = '*';
            $scope.clientAdd.redirectURI = '';

            $scope.clientAddForm.$setUntouched();
            $scope.clientAddForm.$setPristine();

            $('#clientAddModal').modal('show');
        },

        submit: function () {
            $scope.clientAdd.busy = true;
            $scope.clientAdd.error = {};

            var CLIENT_REDIRECT_URI_FALLBACK = Client.apiOrigin;

            Client.createOAuthClient($scope.clientAdd.name, $scope.clientAdd.scope, $scope.clientAdd.redirectURI || CLIENT_REDIRECT_URI_FALLBACK, function (error) {
                $scope.clientAdd.busy = false;

                if (error && error.statusCode === 400) {
                    if (error.message.indexOf('redirectURI must be a valid uri') === 0) {
                        $scope.clientAdd.error.redirectURI = error.message;
                        $scope.clientAddForm.redirectURI.$setPristine();
                        $('#clientAddRedirectURI').focus();
                    } else {
                        // TODO scope checking
                    }
                    return;
                }
                if (error) return console.error('Unable to create API client.', error.statusCode, error.message);

                refresh();

                $('#clientAddModal').modal('hide');
            });
        }
    };

    $scope.clientRemove = {
        busy: false,
        client: {},

        show: function (client) {
            $scope.clientRemove.busy = false;
            $scope.clientRemove.client = client;
            $('#clientRemoveModal').modal('show');
        },

        submit: function () {
            $scope.clientRemove.busy = true;

            Client.delOAuthClient($scope.clientRemove.client.id, function (error) {
                if (error) console.error(error);

                $scope.clientRemove.busy = false;
                $scope.clientRemove.client = {};

                refresh();

                $('#clientRemoveModal').modal('hide');
            });
        }
    };

    $scope.tokenAdd = {
        busy: false,
        token: {},

        show: function (client) {
            $scope.tokenAdd.busy = true;
            $scope.tokenAdd.token = {};

            var expiresAt = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;   // ~100 years from now

            Client.createTokenByClientId(client.id, expiresAt, function (error, result) {
                if (error) console.error(error);

                $scope.tokenAdd.busy = false;
                $scope.tokenAdd.token = result;

                $('#tokenAddModal').modal('show');

                refreshClientTokens(client);
            });
        }
    };

    $scope.removeToken = function (client, token) {
        Client.delToken(client.id, token.accessToken, function (error) {
            if (error) console.error(error);

            refreshClientTokens(client);
        });
    };

    $scope.removeAccessTokens = function (client) {
        client.busy = true;

        Client.delTokensByClientId(client.id, function (error) {
            if (error) console.error(error);

            client.busy = false;

            refreshClientTokens(client);
        });
    };

    $scope.showTutorial = function () {
        Client.setShowTutorial(true, function (error) {
            if (error) return console.error(error);
            $scope.$parent.startTutorial();
        });
    };

    function refreshClientTokens(client) {
        Client.getTokensByClientId(client.id, function (error, result) {
            if (error) console.error(error);

            client.activeTokens = result || [];
        });
    }

    function refresh() {
        $scope.tokenInUse = Client._token;

        Client.getOAuthClients(function (error, activeClients) {
            if (error) return console.error(error);

            $scope.activeClients = activeClients;

            $scope.activeClients.forEach(refreshClientTokens);
        });
    }

    Client.onReady(refresh);

    // setup all the dialog focus handling
    ['passwordChangeModal', 'emailChangeModal', 'displayNameChangeModal', 'clientAddModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
