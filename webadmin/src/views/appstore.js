'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', '$timeout', '$routeParams', 'Client', 'AppStore', function ($scope, $location, $timeout, $routeParams, Client, AppStore) {
    $scope.ready = false;
    $scope.apps = [];
    $scope.config = Client.getConfig();
    $scope.user = Client.getUserInfo();
    $scope.users = [];
    $scope.groups = [];
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
        mediaLinks: [],
        certificateFile: null,
        certificateFileName: '',
        keyFile: null,
        keyFileName: '',
        accessRestrictionOption: '',
        accessRestriction: { users: [], groups: [] },
        accessRestrictionSingleUser: null,

        isAccessRestrictionValid: function () {
            var tmp = $scope.appInstall.accessRestriction;
            return !!(tmp.users.length || tmp.groups.length);
        },

        toggleGroup: function (group) {
            var groups = $scope.appInstall.accessRestriction.groups;
            var pos = groups.indexOf(group.id);

            if (pos === -1) groups.push(group.id);
            else groups.splice(pos, 1);
        },

        reset: function () {
            $scope.appInstall.app = {};
            $scope.appInstall.error = {};
            $scope.appInstall.location = '';
            $scope.appInstall.portBindings = {};
            $scope.appInstall.installFormVisible = false;
            $scope.appInstall.resourceConstraintVisible = false;
            $scope.appInstall.mediaLinks = [];
            $scope.appInstall.certificateFile = null;
            $scope.appInstall.certificateFileName = '';
            $scope.appInstall.keyFile = null;
            $scope.appInstall.keyFileName = '';
            $scope.appInstall.accessRestrictionOption = '';
            $scope.appInstall.accessRestriction = { users: [], groups: [] };
            $scope.appInstall.accessRestrictionSingleUser = null;

            $('#collapseInstallForm').collapse('hide');
            $('#collapseResourceConstraint').collapse('hide');
            $('#collapseMediaLinksCarousel').collapse('show');

            if ($scope.appInstallForm) {
                $scope.appInstallForm.$setPristine();
                $scope.appInstallForm.$setUntouched();
            }
        },

        showForm: function (force) {
            if (Client.enoughResourcesAvailable($scope.appInstall.app) || force) {
                $scope.appInstall.installFormVisible = true;
                $scope.appInstall.resourceConstraintVisible = false;
                $('#collapseMediaLinksCarousel').collapse('hide');
                $('#collapseResourceConstraint').collapse('hide');
                $('#collapseInstallForm').collapse('show');
                $('#appInstallLocationInput').focus();
            } else {
                $scope.appInstall.installFormVisible = false;
                $scope.appInstall.resourceConstraintVisible = true;
                $('#collapseMediaLinksCarousel').collapse('hide');
                $('#collapseResourceConstraint').collapse('show');
            }
        },

        show: function (app) {
            $scope.appInstall.reset();

            // make a copy to work with in case the app object gets updated while polling
            angular.copy(app, $scope.appInstall.app);

            $scope.appInstall.mediaLinks = $scope.appInstall.app.manifest.mediaLinks || [];
            $scope.appInstall.location = app.location;
            $scope.appInstall.portBindingsInfo = $scope.appInstall.app.manifest.tcpPorts || {};   // Portbinding map only for information
            $scope.appInstall.portBindings = {};                            // This is the actual model holding the env:port pair
            $scope.appInstall.portBindingsEnabled = {};                     // This is the actual model holding the enabled/disabled flag
            $scope.appInstall.accessRestrictionOption = app.accessRestriction ? 'restricted' : '';
            $scope.appInstall.accessRestriction = app.accessRestriction || { users: [], groups: [] };
            $scope.appInstall.accessRestrictionSingleUser = null;

            // set default ports
            for (var env in $scope.appInstall.app.manifest.tcpPorts) {
                $scope.appInstall.portBindings[env] = $scope.appInstall.app.manifest.tcpPorts[env].defaultValue || 0;
                $scope.appInstall.portBindingsEnabled[env] = true;
            }

            $('#appInstallModal').modal('show');
        },

        submit: function () {
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

            // translate to accessRestriction object
            var accessRestriction = $scope.appInstall.app.manifest.singleUser ? {
                users: [ $scope.appInstall.accessRestrictionSingleUser.id ]
            } : (!$scope.appInstall.accessRestrictionOption ? null : $scope.appInstall.accessRestriction);

            var data = {
                location: $scope.appInstall.location || '',
                portBindings: finalPortBindings,
                accessRestriction: accessRestriction,
                cert: $scope.appInstall.certificateFile,
                key: $scope.appInstall.keyFile,
            };

            Client.installApp($scope.appInstall.app.id, $scope.appInstall.app.manifest, $scope.appInstall.app.title, data, function (error) {
                if (error) {
                    if (error.statusCode === 409 && (error.message.indexOf('is reserved') !== -1 || error.message.indexOf('is already in use') !== -1)) {
                        $scope.appInstall.error.port = error.message;
                    } else if (error.statusCode === 409) {
                        $scope.appInstall.error.location = 'This name is already taken.';
                        $scope.appInstallForm.location.$setPristine();
                        $('#appInstallLocationInput').focus();
                    } else if (error.statusCode === 402) {
                        $scope.appInstall.error.other = 'Unable to purchase this app<br/>Please make sure your payment is setup <a href="' + $scope.config.webServerOrigin + '/console.html#/userprofile" target="_blank">here</a>';
                    } else if (error.statusCode === 400 && error.message.indexOf('cert') !== -1 ) {
                        $scope.appInstall.error.cert = error.message;
                        $scope.appInstall.certificateFileName = '';
                        $scope.appInstall.certificateFile = null;
                        $scope.appInstall.keyFileName = '';
                        $scope.appInstall.keyFile = null;
                    } else {
                        $scope.appInstall.error.other = error.message;
                    }

                    $scope.appInstall.busy = false;
                    return;
                }

                $scope.appInstall.busy = false;

                // wait for dialog to be fully closed to avoid modal behavior breakage when moving to a different view already
                $('#appInstallModal').on('hidden.bs.modal', function () {
                    $scope.appInstall.reset();
                    $location.path('/apps');
                });

                $('#appInstallModal').modal('hide');
            });
        }
    };

    $scope.appNotFound = {
        appId: '',
        version: ''
    };

    $scope.feedback = {
        error: null,
        subject: 'App feedback',
        description: '',
        type: 'app_missing',

        reset: function () {
            $scope.feedback.busy = false;
            $scope.feedback.error = null;
            $scope.feedback.description = '';

            $scope.feedbackForm.$setUntouched();
            $scope.feedbackForm.$setPristine();
        },

        show: function () {
            $scope.feedback.reset();
            $('#feedbackModal').modal('show');
        },

        submit: function () {
            $scope.feedback.busy = true;
            $scope.feedback.error = null;

            Client.feedback($scope.feedback.type, $scope.feedback.subject, $scope.feedback.description, function (error) {
                $scope.feedback.busy = false;

                if (error) {
                    $scope.feedback.error = error;
                    console.error(error);
                    return;
                }

                $('#feedbackModal').modal('hide');
            });
        }
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

    document.getElementById('appInstallCertificateFileInput').onchange = function (event) {
        $scope.$apply(function () {
            $scope.appInstall.certificateFile = null;
            $scope.appInstall.certificateFileName = event.target.files[0].name;

            var reader = new FileReader();
            reader.onload = function (result) {
                if (!result.target || !result.target.result) return console.error('Unable to read local file');
                $scope.appInstall.certificateFile = result.target.result;
            };
            reader.readAsText(event.target.files[0]);
        });
    };

    document.getElementById('appInstallKeyFileInput').onchange = function (event) {
        $scope.$apply(function () {
            $scope.appInstall.keyFile = null;
            $scope.appInstall.keyFileName = event.target.files[0].name;

            var reader = new FileReader();
            reader.onload = function (result) {
                if (!result.target || !result.target.result) return console.error('Unable to read local file');
                $scope.appInstall.keyFile = result.target.result;
            };
            reader.readAsText(event.target.files[0]);
        });
    };

    $scope.showAppNotFound = function (appId, version) {
        $scope.appNotFound.appId = appId;
        $scope.appNotFound.version = version;

        $('#appNotFoundModal').modal('show');
    };

    $scope.gotoApp = function (app) {
        $location.path('/appstore/' + app.manifest.id, false).search({ version : app.manifest.version });
    };

    function hashChangeListener() {
        var appId = $location.path().slice('/appstore/'.length);
        var version = $location.search().version;

        if (appId) {
            if (version) {
                AppStore.getAppByIdAndVersion(appId, version, function (error, result) {
                    if (error) {
                        $scope.showAppNotFound(appId, version);
                        console.error(error);
                        return;
                    }

                    $scope.appInstall.show(result);
                });
            } else {
                var found = $scope.apps.filter(function (app) {
                    return (app.id === appId) && (version ? version === app.manifest.version : true);
                });

                if (found.length) {
                    $scope.appInstall.show(found[0]);
                } else {
                    $scope.showAppNotFound(appId, null);
                }
            }
        } else {
            $scope.appInstall.reset();
        }
    }

    function fetchUsers() {
        Client.getUsers(function (error, users) {
            if (error) {
                console.error(error);
                return $timeout(fetchUsers, 5000);
            }

            $scope.users = users;
        });
    }

    function fetchGroups() {
        Client.getGroups(function (error, groups) {
            if (error) {
                console.error(error);
                return $timeout(fetchUsers, 5000);
            }

            $scope.groups = groups;
        });
    }

    Client.onReady(function () {
        (function refresh() {
            $scope.ready = false;

            getAppList(function (error, apps) {
                if (error) {
                    console.error(error);
                    return $timeout(refresh, 1000);
                }

                $scope.apps = apps;

                // show install app dialog immediately if an app id was passed in the query
                hashChangeListener();

                if ($scope.user.admin) {
                    fetchUsers();
                    fetchGroups();
                }

                $scope.ready = true;
            });
        })();

    });

    $('#appInstallModal').on('hide.bs.modal', function () {
        $location.path('/appstore', false).search({ version: undefined });
    });

    window.addEventListener('hashchange', hashChangeListener);

    $scope.$on('$destroy', function handler() {
        window.removeEventListener('hashchange', hashChangeListener);
    });

    // setup all the dialog focus handling
    ['appInstallModal', 'feedbackModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
