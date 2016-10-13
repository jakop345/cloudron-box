'use strict';

angular.module('Application').controller('MainController', ['$scope', '$route', '$interval', 'Client', function ($scope, $route, $interval, Client) {
    $scope.initialized = false;
    $scope.user = Client.getUserInfo();
    $scope.installedApps = Client.getInstalledApps();
    $scope.config = {};
    $scope.client = Client;

    $scope.tutorialStep = -1;
    $scope.tutorialSteps = [
        { title: 'intro', page: '#/apps' },
        { title: 'appstore', page: '#/appstore' },
        { title: 'users', page: '#/users' }
    ];

    $scope.startTutorial = function () {
        $scope.tutorialStep = 0;
        if ($scope.tutorialSteps[$scope.tutorialStep]) window.location.href = $scope.tutorialSteps[$scope.tutorialStep].page;
    };

    $scope.endTutorial = function () {
        $scope.tutorialStep = -1;

        Client.setShowTutorial(false, function (error) {
            if (error) console.error(error);

            window.location.href = '#/apps';
        });
    };

    $scope.nextTutorialStep = function () {
        $scope.tutorialStep += 1;

        if ($scope.tutorialSteps[$scope.tutorialStep]) window.location.href = $scope.tutorialSteps[$scope.tutorialStep].page;

        if ($scope.tutorialStep >= $scope.tutorialSteps.length) $scope.endTutorial();
    };

    $scope.prevTutorialStep = function () {
        $scope.tutorialStep -= 1;

        if ($scope.tutorialSteps[$scope.tutorialStep]) window.location.href = $scope.tutorialSteps[$scope.tutorialStep].page;
    };

    $scope.update = {
        busy: false,
        error: {},
        password: ''
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

    $scope.error = function (error) {
        console.error(error);
        window.location.href = '/error.html';
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

    function runConfigurationChecks() {
        // Check if a proper storage backend is configured
        Client.getBackupConfig(function (error, result) {
            if (error) return console.error(error);

            if (result.provider === 'filesystem') {
                var actionScope = $scope.$new(true);
                actionScope.action = '/#/settings';

                Client.notify('Backup Configuration', 'Please setup an external backup storage to avoid data loss', true, 'info', actionScope);
            }
        });
    }

    Client.getStatus(function (error, status) {
        if (error) return $scope.error(error);

        if (!status.activated) {
            window.location.href = '/setup.html';
            return;
        }

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
                    if ($scope.user.showTutorial && $scope.user.admin) $scope.startTutorial();

                    // configuration checks
                    if ($scope.user.admin) runConfigurationChecks();
                });
            });
        });
    });

    // wait till the view has loaded until showing a modal dialog
    Client.onConfig(function (config) {
        // check if we are actually updating
        if (config.progress.update && config.progress.update.percent !== -1) {
            window.location.href = '/update.html';
        }

        if (config.cloudronName) {
            document.title = config.cloudronName;
        }
    });

    // setup all the dialog focus handling
    ['updateModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
