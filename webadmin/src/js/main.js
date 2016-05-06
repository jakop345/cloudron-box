'use strict';

angular.module('Application').controller('MainController', ['$scope', '$route', '$interval', 'Client', function ($scope, $route, $interval, Client) {
    $scope.initialized = false;
    $scope.user = Client.getUserInfo();
    $scope.installedApps = Client.getInstalledApps();
    $scope.config = {};
    $scope.client = Client;

    $scope.welcomeStep = -1;
    $scope.welcomeSteps = [
        { title: 'intro', page: '#/apps' },
        { title: 'apps', page: '#/apps' },
        { title: 'appstore', page: '#/appstore' },
        { title: 'users', page: '#/users' },
        { title: 'finish', page: '#/apps' }
    ];

    $scope.nextWelcomeStep = function () {
        $scope.welcomeStep += 1;

        if ($scope.welcomeSteps[$scope.welcomeStep]) window.location.href = $scope.welcomeSteps[$scope.welcomeStep].page;
    };

    $scope.prevWelcomeStep = function () {
        $scope.welcomeStep -= 1;

        if ($scope.welcomeSteps[$scope.welcomeStep]) window.location.href = $scope.welcomeSteps[$scope.welcomeStep].page;
    };

    $scope.update = {
        busy: false,
        error: {},
        password: ''
    };

    $scope.upgradeRequest = {
        busy: false
    };

    $scope.isActive = function (url) {
        if (!$route.current) return false;
        return $route.current.$$route.originalPath.indexOf(url) === 0;
    };

    $scope.logout = function (event) {
        event.stopPropagation();
        $scope.initialized = false;
        Client.logout();
    };

    $scope.setup = function (provider) {
        if (provider === 'caas') {
            window.location.href = '/error.html?errorCode=1';
        } else {
            window.location.href = '/setup.html';
        }
    };

    $scope.error = function (error) {
        console.error(error);
        window.location.href = '/error.html';
    };

    $scope.requestUpgrade = function () {
        $scope.upgradeRequest.busy = true;

        var subject = 'User requested upgrade for ' + $scope.config.fqdn;
        var description = 'User ' + $scope.user.email + ' requested an upgrade for ' + $scope.config.fqdn + '. Get back to him!!';

        Client.feedback('upgrade_request', subject, description, function (error) {
            $scope.upgradeRequest.busy = false;

            if (error) return Client.notify('Error', error.message, false, 'error');

            Client.notify('Success', 'We will get back to you as soon as possible for the upgrade.', true, 'success');

            $('#upgradeModal').modal('hide');
        });
    };

    $scope.showUpdateModal = function (form) {
        $scope.update.error.password = null;
        $scope.update.password = '';

        form.$setPristine();
        form.$setUntouched();

        $('#updateModal').modal('show');
    };

    $scope.doUpdate = function () {
        $scope.update.error.password = null;

        $scope.update.busy = true;
        Client.update($scope.update.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.update.error.password = true;
                    $scope.update.password = '';
                    $scope.update_form.password.$setPristine();
                    $('#inputUpdatePassword').focus();
                } else {
                    console.error('Unable to update.', error);
                }
                $scope.update.busy = false;
                return;
            }

            window.location.href = '/update.html';
        });
    };

    Client.getStatus(function (error, status) {
        if (error) return $scope.error(error);
        if (!status.activated) return $scope.setup();

        Client.refreshConfig(function (error) {
            if (error) return $scope.error(error);

            // check version and force reload if needed
            if (!localStorage.version) {
                localStorage.version = Client.getConfig().version;
            } else if (localStorage.version !== Client.getConfig().version) {
                localStorage.version = Client.getConfig().version;
                window.location.reload(true);
            }


            Client.refreshUserInfo(function (error) {
                if (error) return $scope.error(error);

                Client.refreshInstalledApps(function (error) {
                    if (error) return $scope.error(error);

                    // kick off installed apps and config polling
                    var refreshAppsTimer = $interval(Client.refreshInstalledApps.bind(Client), 5000);
                    var refreshConfigTimer = $interval(Client.refreshConfig.bind(Client), 5000);
                    var refreshUserInfoTimer = $interval(Client.refreshUserInfo.bind(Client), 5000);

                    $scope.$on('$destroy', function () {
                        $interval.cancel(refreshAppsTimer);
                        $interval.cancel(refreshConfigTimer);
                        $interval.cancel(refreshUserInfoTimer);
                    });

                    // now mark the Client to be ready
                    Client.setReady();

                    $scope.config = Client.getConfig();

                    $scope.initialized = true;

                    // check if we have aws credentials if selfhosting
                    if ($scope.config.isCustomDomain) {
                        Client.getDnsConfig(function (error, result) {
                            if (error) return console.error(error);

                            if (result.provider === 'route53' && (!result.accessKeyId || !result.secretAccessKey)) {
                                var actionScope = $scope.$new(true);
                                actionScope.action = '/#/certs';
                                Client.notify('Missing AWS credentials', 'Please provide AWS credentials, click here to add them.', true, 'error', actionScope);
                            }
                        });
                    }

                    // welcome screen
                    if ($scope.user.showTutorial && $scope.user.admin) $scope.nextWelcomeStep();
                });
            });
        });
    });

    // wait till the view has loaded until showing a modal dialog
    Client.onConfig(function (config) {
        if (!config.billing) {
            setTimeout(function () {
                $('.upgrade')[0].classList.remove('hide');

                $('.upgrade .trigger').hover(function () {
                    $('.upgrade .content')[0].classList.add('active');
                    $('.upgrade .trigger')[0].classList.add('active');
                });

                $('.upgrade').hover(function () {}, function () {
                    $('.upgrade .content')[0].classList.remove('active');
                    $('.upgrade .trigger')[0].classList.remove('active');
                });
            }, 2000);
        }

        // check if we are actually updating
        if (config.progress.update && config.progress.update.percent !== -1) {
            window.location.href = '/update.html';
        }
    });


    // setup all the dialog focus handling
    ['updateModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
