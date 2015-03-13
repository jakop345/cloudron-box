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
        newPasswordRepeat: ''
    };

    $scope.emailchange = {
        busy: false,
        error: {},
        email: '',
        password: ''
    };

    $scope.developerModeChange = {
        busy: false,
        error: {},
        password: ''
    };

    function passwordChangeReset (form) {
        $scope.passwordchange.error.password = null;
        $scope.passwordchange.error.newPassword = null;
        $scope.passwordchange.error.newPasswordRepeat = null;
        $scope.passwordchange.password = '';
        $scope.passwordchange.newPassword = '';
        $scope.passwordchange.newPasswordRepeat = '';

        if (form) {
            form.$setPristine();
            form.$setUntouched();
        }
    }

    function emailChangeReset (form) {
        $scope.emailchange.error.email = null;
        $scope.emailchange.error.password = null;
        $scope.emailchange.email = '';
        $scope.emailchange.password = '';

        if (form) {
            form.$setPristine();
            form.$setUntouched();
        }
    }

    function developerModeChangeReset () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.password = '';

        $scope.developerModeChangeForm.$setPristine();
        $scope.developerModeChangeForm.$setUntouched();
    }

    $scope.doChangePassword = function (form) {
        $scope.passwordchange.error.password = null;
        $scope.passwordchange.error.newPassword = null;
        $scope.passwordchange.error.newPasswordRepeat = null;
        $scope.passwordchange.busy = true;

        Client.changePassword($scope.passwordchange.password, $scope.passwordchange.newPassword, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.passwordchange.error.password = true;
                    $scope.passwordchange.password = '';
                } else {
                    console.error('Unable to change password.', error);
                }
                return;
            }

            $scope.passwordchange.busy = false;
            passwordChangeReset(form);

            $('#passwordChangeModal').modal('hide');
        });
    };

    $scope.doChangeEmail = function (form) {
        $scope.emailchange.error.email = null;
        $scope.emailchange.error.password = null;
        $scope.emailchange.busy = true;

        Client.changeEmail($scope.emailchange.email, $scope.emailchange.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.emailchange.error.password = true;
                    $scope.emailchange.password = '';
                } else {
                    console.error('Unable to change email.', error);
                }
                return;
            }

            $scope.emailchange.busy = false;
            emailChangeReset(form);

            // fetch new info in the background
            Client.userInfo(function () {});

            $('#emailChangeModal').modal('hide');
        });
    };

    $scope.doChangeDeveloperMode = function () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.busy = true;

        Client.changeDeveloperMode(!$scope.config.developerMode, $scope.developerModeChange.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.developerModeChange.error.password = true;
                    $scope.developerModeChange.password = '';
                } else {
                    console.error('Unable to change password.', error);
                }
                return;
            }

            $scope.developerModeChange.busy = false;
            developerModeChangeReset();

            $('#developerModeChangeModal').modal('hide');
        });
    };

    $scope.showChangePassword = function (form) {
        passwordChangeReset(form);

        $('#passwordChangeModal').modal('show');
    };

    $scope.showChangeEmail = function (form) {
        emailChangeReset(form);

        $('#emailChangeModal').modal('show');
    };

    $scope.showChangeDeveloperMode = function () {
        developerModeChangeReset();

        $('#developerModeChangeModal').modal('show');
    };

    $scope.removeAccessTokens = function (client, event) {
        Client.delTokensByClientId(client.id, function (error) {
            if (error) return console.error(error);
            $(event.target).addClass('disabled');
        });
    };

    Client.onReady(function () {
        $scope.tokenInUse = Client._token;

        Client.getOAuthClients(function (error, activeClients) {
            if (error) return console.error(error);

            $scope.activeClients = activeClients;
        });
    });

    // setup all the dialog focus handling
    ['passwordChangeModal', 'emailChangeModal', 'developerModeChangeModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
