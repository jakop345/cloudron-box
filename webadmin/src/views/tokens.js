'use strict';

angular.module('Application').controller('TokensController', ['$scope', 'Client', function ($scope, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.activeClients = [];
    $scope.apiClient = {};

    $scope.developerModeChange = {
        busy: false,
        error: {},
        password: ''
    };

    function developerModeChangeReset () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.password = '';

        $scope.developerModeChangeForm.$setPristine();
        $scope.developerModeChangeForm.$setUntouched();
    }

    $scope.doChangeDeveloperMode = function () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.busy = true;

        Client.changeDeveloperMode(!$scope.config.developerMode, $scope.developerModeChange.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.developerModeChange.error.password = true;
                    $scope.developerModeChange.password = '';
                    $scope.developerModeChangeForm.password.$setPristine();
                    $('#inputDeveloperModeChangePassword').focus();
                } else {
                    console.error('Unable to change developer mode.', error);
                }
            } else {
                developerModeChangeReset();

                $('#developerModeChangeModal').modal('hide');
            }

            $scope.developerModeChange.busy = false;
        });
    };

    $scope.showChangeDeveloperMode = function () {
        developerModeChangeReset();
        $('#developerModeChangeModal').modal('show');
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

            var CLIENT_REDIRECT_URI_FALLBACK = Client.apiOrigin || location.origin;

            Client.createOAuthClient($scope.clientAdd.name, $scope.clientAdd.scope, $scope.clientAdd.redirectURI || CLIENT_REDIRECT_URI_FALLBACK, function (error) {
                $scope.clientAdd.busy = false;

                if (error && error.statusCode === 400) {
                    if (error.message.indexOf('redirectURI must be a valid uri') === 0) {
                        $scope.clientAdd.error.redirectURI = error.message;
                        $scope.clientAddForm.redirectURI.$setPristine();
                        $('#clientAddRedirectURI').focus();
                    } else if (error.message.indexOf('Username can only contain alphanumerals and dash') === 0) {
                        $scope.clientAdd.error.name = error.message;
                        $scope.clientAddForm.name.$setPristine();
                        $('#clientAddName').focus();
                    } else if (error.message.indexOf('Invalid scope') === 0) {
                        $scope.clientAdd.error.scope = error.message;
                        $scope.clientAddForm.scope.$setPristine();
                        $('#clientAddScope').focus();
                    } else {
                        console.error(error);
                    }
                    return;
                } else if (error && error.statusCode === 412) {
                    var actionScope = $scope.$new(true);
                    actionScope.action = '/#/settings';

                    Client.notify('Not allowed', 'You have to enable the external API in the settings.', false, 'error', actionScope);

                    return;
                } else if (error) return console.error('Unable to create API client.', error.statusCode, error.message);

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
                $scope.clientRemove.busy = false;

                if (error && error.statusCode === 412) {
                    var actionScope = $scope.$new(true);
                    actionScope.action = '/#/settings';

                    Client.notify('Not allowed', 'You have to enable the external API in the settings.', false, 'error', actionScope);

                    return;
                } else if (error) {
                    return console.error(error);
                }

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
                if (error && error.statusCode === 412) {
                    var actionScope = $scope.$new(true);
                    actionScope.action = '/#/settings';

                    Client.notify('Not allowed', 'You have to enable the external API in the settings.', false, 'error', actionScope);

                    return;
                } else if (error) {
                    return console.error(error);
                }

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

    function refreshClientTokens(client) {
        Client.getTokensByClientId(client.id, function (error, result) {
            if (error) console.error(error);

            client.activeTokens = result || [];
        });
    }

    function refresh() {
        Client.getOAuthClients(function (error, activeClients) {
            if (error) return console.error(error);

            activeClients.forEach(refreshClientTokens);

            $scope.activeClients = activeClients.filter(function (c) { return c.id !== 'cid-sdk'; });
            $scope.apiClient = activeClients.filter(function (c) { return c.id === 'cid-sdk'; })[0];
        });
    }

    Client.onReady(refresh);

    // setup all the dialog focus handling
    ['developerModeChangeModal', 'clientAddModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
