'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', '$timeout', '$routeParams', 'Client', 'AppStore', function ($scope, $location, $timeout, $routeParams, Client, AppStore) {
    $scope.ready = false;
    $scope.apps = [];
    $scope.config = Client.getConfig();
    $scope.user = Client.getUserInfo();
    $scope.category = '';
    $scope.cachedCategory = ''; // used to cache the selected category while searching
    $scope.searchString = '';

    $scope.appInstall = {
        busy: false,
        installFormVisible: false,
        error: {},
        app: {},
        location: '',
        portBindings: {},
        accessRestriction: '',
        mediaLinks: []
    };

    $scope.appNotFound = {
        appId: '',
        version: ''
    };

    $scope.feedback = {
        error: null,
        success: false,
        subject: 'App feedback',
        description: '',
        type: 'app'
    };

    function resetFeedback() {
        $scope.feedback.description = '';

        $scope.feedbackForm.$setUntouched();
        $scope.feedbackForm.$setPristine();
    }

    $scope.submitFeedback = function () {
        $scope.feedback.busy = true;
        $scope.feedback.success = false;
        $scope.feedback.error = null;

        Client.feedback($scope.feedback.type, $scope.feedback.subject, $scope.feedback.description, function (error) {
            if (error) {
                $scope.feedback.error = error;
            } else {
                $scope.feedback.success = true;
                $('#feedbackModal').modal('hide');
                resetFeedback();
            }

            $scope.feedback.busy = false;
        });
    };

    $scope.showFeedbackModal = function () {
        $('#feedbackModal').modal('show');
    };

    function getAppList(callback) {
        AppStore.getApps(function (error, apps) {
            if (error) return callback(error);

            // ensure we have a tags property for further use
            apps.forEach(function (app) {
                if (!app.manifest.tags) app.manifest.tags = [];
            });

            Client.getNonApprovedApps(function (error, result) {
                if (error) return callback(error);

                // add testing tag to the manifest for UI and search reasons
                result.forEach(function (app) {
                    if (!app.manifest.tags) app.manifest.tags = [];
                    app.manifest.tags.push('testing');
                });

                callback(null, apps.concat(result));
            });
        });
    }

    // TODO does not support testing apps in search
    $scope.search = function () {
        if (!$scope.searchString) return $scope.showCategory(null, $scope.cachedCategory);

        $scope.category = '';

        AppStore.getAppsFast(function (error, apps) {
            if (error) return $timeout($scope.search, 1000);

            var token = $scope.searchString.toUpperCase();

            $scope.apps = apps.filter(function (app) {
                if (app.manifest.id.toUpperCase().indexOf(token) !== -1) return true;
                if (app.manifest.title.toUpperCase().indexOf(token) !== -1) return true;
                if (app.manifest.tagline.toUpperCase().indexOf(token) !== -1) return true;
                if (app.manifest.tags.join().toUpperCase().indexOf(token) !== -1) return true;
                if (app.manifest.description.toUpperCase().indexOf(token) !== -1) return true;
                return false;
            });
        });
    };

    $scope.showCategory = function (event, category) {
        if (!event) $scope.category = category;
        else $scope.category = event.target.getAttribute('category');

        $scope.cachedCategory = $scope.category;

        $scope.ready = false;

        getAppList(function (error, apps) {
            if (error) return $timeout($scope.showCategory.bind(null, event), 1000);

            if (!$scope.category) {
                $scope.apps = apps;
            } else {
                $scope.apps = apps.filter(function (app) {
                    return app.manifest.tags.some(function (tag) { return $scope.category === tag; });
                });
            }

            $scope.ready = true;
        });
    };

    $scope.reset = function () {
        $scope.appInstall.app = {};
        $scope.appInstall.error = {};
        $scope.appInstall.location = '';
        $scope.appInstall.portBindings = {};
        $scope.appInstall.accessRestriction = '';
        $scope.appInstall.installFormVisible = false;
        $scope.appInstall.mediaLinks = [];
        $('#collapseInstallForm').collapse('hide');
        $('#collapseMediaLinksCarousel').collapse('show');

        $scope.appInstallForm.$setPristine();
        $scope.appInstallForm.$setUntouched();
    };

    $scope.showInstallForm = function () {
        $scope.appInstall.installFormVisible = true;
        $('#collapseMediaLinksCarousel').collapse('hide');
        $('#collapseInstallForm').collapse('show');
        $('#appInstallLocationInput').focus();
    };

    $scope.showInstall = function (app) {
        $scope.reset();

        // make a copy to work with in case the app object gets updated while polling
        angular.copy(app, $scope.appInstall.app);
        $('#appInstallModal').modal('show');

        $scope.appInstall.mediaLinks = $scope.appInstall.app.manifest.mediaLinks || [];
        $scope.appInstall.location = app.location;
        $scope.appInstall.portBindingsInfo = $scope.appInstall.app.manifest.tcpPorts || {};   // Portbinding map only for information
        $scope.appInstall.portBindings = {};                            // This is the actual model holding the env:port pair
        $scope.appInstall.portBindingsEnabled = {};                     // This is the actual model holding the enabled/disabled flag
        $scope.appInstall.accessRestriction = app.accessRestriction || '';

        // set default ports
        for (var env in $scope.appInstall.app.manifest.tcpPorts) {
            $scope.appInstall.portBindings[env] = $scope.appInstall.app.manifest.tcpPorts[env].defaultValue || 0;
            $scope.appInstall.portBindingsEnabled[env] = true;
        }
    };

    $scope.showAppNotFound = function (appId, version) {
        $scope.appNotFound.appId = appId;
        $scope.appNotFound.version = version;

        $('#appNotFoundModal').modal('show');
    };

    $scope.doInstall = function () {
        $scope.appInstall.busy = true;
        $scope.appInstall.error.other = null;
        $scope.appInstall.error.location = null;
        $scope.appInstall.error.port = null;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appInstall.portBindings) {
            if ($scope.appInstall.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appInstall.portBindings[env];
            }
        }

        Client.installApp($scope.appInstall.app.id, $scope.appInstall.app.manifest, $scope.appInstall.app.title, { location: $scope.appInstall.location || '', portBindings: finalPortBindings, accessRestriction: $scope.appInstall.accessRestriction }, function (error) {
            if (error) {
                if (error.statusCode === 409 && (error.message.indexOf('is reserved') !== -1 || error.message.indexOf('is already in use') !== -1)) {
                    $scope.appInstall.error.port = error.message;
                } else if (error.statusCode === 409) {
                    $scope.appInstall.error.location = 'This name is already taken.';
                    $scope.appInstallForm.location.$setPristine();
                    $('#appInstallLocationInput').focus();
                } else if (error.statusCode === 402) {
                    $scope.appInstall.error.other = 'Unable to purchase this app<br/>Please make sure your payment is setup <a href="' + $scope.config.webServerOrigin + '/console.html#/userprofile" target="_blank">here</a>';
                } else {
                    $scope.appInstall.error.other = error.message;
                }

                $scope.appInstall.busy = false;
                return;
            }

            $scope.appInstall.busy = false;

            // wait for dialog to be fully closed to avoid modal behavior breakage when moving to a different view already
            $('#appInstallModal').on('hidden.bs.modal', function () {
                $scope.reset();
                $location.path('/apps');
            });

            $('#appInstallModal').modal('hide');
        });
    };

    function refresh() {
        $scope.ready = false;

        getAppList(function (error, apps) {
            if (error) {
                console.error(error);
                return $timeout(refresh, 1000);
            }

            $scope.apps = apps;

            // show install app dialog immediately if an app id was passed in the query
            if ($routeParams.appId) {
                if ($routeParams.version) {
                    AppStore.getAppByIdAndVersion($routeParams.appId, $routeParams.version, function (error, result) {
                        if (error) {
                            $scope.showAppNotFound($routeParams.appId, $routeParams.version);
                            console.error(error);
                            return;
                        }

                        $scope.showInstall(result);
                    });
                } else {
                    var found = apps.filter(function (app) {
                        return (app.id === $routeParams.appId) && ($routeParams.version ? $routeParams.version === app.manifest.version : true);
                    });

                    if (found.length) {
                        $scope.showInstall(found[0]);
                    } else {
                        $scope.showAppNotFound($routeParams.appId, null);
                    }
                }
            }

            $scope.ready = true;
        });
    }

    refresh();

    // setup all the dialog focus handling
    ['appInstallModal', 'feedbackModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
