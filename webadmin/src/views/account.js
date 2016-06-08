'use strict';

angular.module('Application').controller('AccountController', ['$scope', 'Client', function ($scope, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.activeTokens = 0;
    $scope.activeClients = [];
    $scope.webadminClient = {};

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

    $scope.showTutorial = function () {
        Client.setShowTutorial(true, function (error) {
            if (error) return console.error(error);
            $scope.$parent.startTutorial();
        });
    };

    // poor man's async
    function asyncForEach(items, handler, callback) {
        var cur = 0;

        (function iterator() {
            handler(items[cur], function () {
                if (cur >= items.length-1) return callback();
                ++cur;

                iterator();
            });
        })();
    }

    function revokeTokensByClient(client, callback) {
        Client.delTokensByClientId(client.id, function (error) {
            if (error) console.error(error);
            callback();
        });
    }

    $scope.revokeTokens = function () {
        asyncForEach($scope.activeClients, revokeTokensByClient, function () {

            // now kill this session if exists
            if (!$scope.webadminClient || !$scope.webadminClient.id) return;

            revokeTokensByClient($scope.webadminClient, function () {
                // we should be logged out by now
            });
        });
    };

    function refreshClientTokens(client, callback) {
        Client.getTokensByClientId(client.id, function (error, result) {
            if (error) console.error(error);

            client.activeTokens = result || [];

            callback();
        });
    }

    Client.onReady(function () {
        Client.getOAuthClients(function (error, activeClients) {
            if (error) return console.error(error);

            asyncForEach(activeClients, refreshClientTokens, function () {
                activeClients = activeClients.filter(function (c) { return c.activeTokens.length > 0; });

                $scope.activeClients = activeClients.filter(function (c) { return c.id !== 'cid-sdk' && c.id !== 'cid-webadmin'; });
                $scope.webadminClient = activeClients.filter(function (c) { return c.id === 'cid-webadmin'; })[0];

                $scope.activeTokenCount = $scope.activeClients.reduce(function (prev, cur) { return prev + cur.activeTokens.length; }, 0);
                $scope.activeTokenCount += $scope.webadminClient ? $scope.webadminClient.activeTokens.length : 0;
            });
        });
    });

    // setup all the dialog focus handling
    ['passwordChangeModal', 'emailChangeModal', 'displayNameChangeModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
