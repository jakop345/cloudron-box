'use strict';

angular.module('Application').controller('AppsController', ['$scope', '$location', '$timeout', 'Client', 'AppStore', function ($scope, $location, $timeout, Client, AppStore) {
    $scope.HOST_PORT_MIN = 1024;
    $scope.HOST_PORT_MAX = 65535;

    $scope.installedApps = Client.getInstalledApps();
    $scope.config = Client.getConfig();
    $scope.user = Client.getUserInfo();
    $scope.groups = [];
    $scope.users = [];

    $scope.memoryTicks = [
        256 * 1024 * 1024,
        512 * 1024 * 1024,
        1024 * 1024 * 1024,
        2048 * 1024 * 1024,
        4096 * 1024 * 1024
    ];

    $scope.appConfigure = {
        busy: false,
        error: {},
        app: {},
        location: '',
        altDomain: null,
        password: '',
        portBindings: {},
        portBindingsEnabled: {},
        portBindingsInfo: {},
        certificateFile: null,
        certificateFileName: '',
        keyFile: null,
        keyFileName: '',
        memoryLimit: $scope.memoryTicks[0],
        accessRestrictionOption: '',
        accessRestriction: { users: [], groups: [] },

        isAccessRestrictionValid: function () {
            var tmp = $scope.appConfigure.accessRestriction;
            return !!(tmp.users.length || tmp.groups.length);
        }
    };

    $scope.appUninstall = {
        busy: false,
        error: {},
        app: {},
        password: ''
    };

    $scope.appRestore = {
        busy: false,
        error: {},
        app: {},
        password: ''
    };

    $scope.appError = {
        app: {}
    };

    $scope.appUpdate = {
        busy: false,
        error: {},
        app: {},
        password: '',
        manifest: {},
        portBindings: {}
    };

    $scope.reset = function () {
        // reset configure dialog
        $scope.appConfigure.error = {};
        $scope.appConfigure.app = {};
        $scope.appConfigure.location = '';
        $scope.appConfigure.altDomain = null;
        $scope.appConfigure.password = '';
        $scope.appConfigure.portBindings = {};          // This is the actual model holding the env:port pair
        $scope.appConfigure.portBindingsEnabled = {};   // This is the actual model holding the enabled/disabled flag
        $scope.appConfigure.certificateFile = null;
        $scope.appConfigure.certificateFileName = '';
        $scope.appConfigure.keyFile = null;
        $scope.appConfigure.keyFileName = '';
        $scope.appConfigure.memoryLimit = $scope.memoryTicks[0];
        $scope.appConfigure.accessRestrictionOption = '';
        $scope.appConfigure.accessRestriction = { users: [], groups: [] };

        $scope.appConfigureForm.$setPristine();
        $scope.appConfigureForm.$setUntouched();

        // reset uninstall dialog
        $scope.appUninstall.app = {};
        $scope.appUninstall.error = {};
        $scope.appUninstall.password = '';

        $scope.appUninstallForm.$setPristine();
        $scope.appUninstallForm.$setUntouched();

        // reset update dialog
        $scope.appUpdate.error = {};
        $scope.appUpdate.app = {};
        $scope.appUpdate.password = '';
        $scope.appUpdate.manifest = {};
        $scope.appUpdate.portBindings = {};

        $scope.appUpdateForm.$setPristine();
        $scope.appUpdateForm.$setUntouched();

        // reset restore dialog
        $scope.appRestore.error = {};
        $scope.appRestore.app = {};
        $scope.appRestore.password = '';

        $scope.appRestoreForm.$setPristine();
        $scope.appRestoreForm.$setUntouched();
    };

    document.getElementById('appConfigureCertificateFileInput').onchange = function (event) {
        $scope.$apply(function () {
            $scope.appConfigure.certificateFile = null;
            $scope.appConfigure.certificateFileName = event.target.files[0].name;

            var reader = new FileReader();
            reader.onload = function (result) {
                if (!result.target || !result.target.result) return console.error('Unable to read local file');
                $scope.appConfigure.certificateFile = result.target.result;
            };
            reader.readAsText(event.target.files[0]);
        });
    };

    document.getElementById('appConfigureKeyFileInput').onchange = function (event) {
        $scope.$apply(function () {
            $scope.appConfigure.keyFile = null;
            $scope.appConfigure.keyFileName = event.target.files[0].name;

            var reader = new FileReader();
            reader.onload = function (result) {
                if (!result.target || !result.target.result) return console.error('Unable to read local file');
                $scope.appConfigure.keyFile = result.target.result;
            };
            reader.readAsText(event.target.files[0]);
        });
    };

    $scope.appConfigureToggleGroup = function (group) {
        var groups = $scope.appConfigure.accessRestriction.groups;
        var pos = groups.indexOf(group.id);

        if (pos === -1) groups.push(group.id);
        else groups.splice(pos, 1);
    };

    $scope.showConfigure = function (app) {
        $scope.reset();

        // fill relevant info from the app
        $scope.appConfigure.app = app;
        $scope.appConfigure.location = app.location;
        $scope.appConfigure.altDomain = app.altDomain;
        $scope.appConfigure.portBindingsInfo = app.manifest.tcpPorts || {}; // Portbinding map only for information
        $scope.appConfigure.accessRestrictionOption = app.accessRestriction ? 'restricted' : '';
        $scope.appConfigure.accessRestriction = app.accessRestriction || { users: [], groups: [] };
        $scope.appConfigure.memoryUsage = app.memoryUsage || 256;

        // fill the portBinding structures. There might be holes in the app.portBindings, which signalizes a disabled port
        for (var env in $scope.appConfigure.portBindingsInfo) {
            if (app.portBindings && app.portBindings[env]) {
                $scope.appConfigure.portBindings[env] = app.portBindings[env];
                $scope.appConfigure.portBindingsEnabled[env] = true;
            } else {
                $scope.appConfigure.portBindings[env] = $scope.appConfigure.portBindingsInfo[env].defaultValue || 0;
                $scope.appConfigure.portBindingsEnabled[env] = false;
            }
        }

        $('#appConfigureModal').modal('show');
    };

    $scope.doConfigure = function () {
        $scope.appConfigure.busy = true;
        $scope.appConfigure.error.other = null;
        $scope.appConfigure.error.location = null;
        $scope.appConfigure.error.password = null;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appConfigure.portBindings) {
            if ($scope.appConfigure.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appConfigure.portBindings[env];
            }
        }

        var data = {
            location: $scope.appConfigure.location || '',
            altDomain: $scope.appConfigure.altDomain || null,
            portBindings: finalPortBindings,
            accessRestriction: !$scope.appConfigure.accessRestrictionOption ? null : $scope.appConfigure.accessRestriction,
            cert: $scope.appConfigure.certificateFile,
            key: $scope.appConfigure.keyFile
            // memoryLimit: $scope.appConfigure.memoryLimit
        };

        Client.configureApp($scope.appConfigure.app.id, $scope.appConfigure.password, data, function (error) {
            if (error) {
                if (error.statusCode === 409 && (error.message.indexOf('is reserved') !== -1 || error.message.indexOf('is already in use') !== -1)) {
                    $scope.appConfigure.error.port = error.message;
                } else if (error.statusCode === 409) {
                    $scope.appConfigure.error.location = 'This name is already taken.';
                    $scope.appConfigureForm.location.$setPristine();
                    $('#appConfigureLocationInput').focus();
                } else if (error.statusCode === 403) {
                    $scope.appConfigure.error.password = true;
                    $scope.appConfigure.password = '';
                    $scope.appConfigureForm.password.$setPristine();
                    $('#appConfigurePasswordInput').focus();
                } else if (error.statusCode === 400 && error.message.indexOf('cert') !== -1 ) {
                    $scope.appConfigure.error.cert = error.message;
                    $scope.appConfigure.certificateFileName = '';
                    $scope.appConfigure.certificateFile = null;
                    $scope.appConfigure.keyFileName = '';
                    $scope.appConfigure.keyFile = null;
                } else {
                    $scope.appConfigure.error.other = error.message;
                }

                $scope.appConfigure.busy = false;
                return;
            }

            $scope.appConfigure.busy = false;

            $('#appConfigureModal').modal('hide');

            $scope.reset();
        });
    };

    $scope.showError = function (app) {
        $scope.reset();

        $scope.appError.app = app;

        $('#appErrorModal').modal('show');

        return false; // prevent propagation and default
    };

    $scope.showRestore = function (app) {
        $scope.reset();

        $scope.appRestore.app = app;

        $('#appRestoreModal').modal('show');
    };

    $scope.doRestore = function () {
        $scope.appRestore.busy = true;
        $scope.appRestore.error.password = null;

        Client.restoreApp($scope.appRestore.app.id, $scope.appRestore.password, function (error) {
            if (error && error.statusCode === 403) {
                $scope.appRestore.password = '';
                $scope.appRestore.error.password = true;
                $scope.appRestoreForm.password.$setPristine();
                $('#appRestorePasswordInput').focus();
            } else if (error) {
                Client.error(error);
            } else {
                $('#appRestoreModal').modal('hide');
                $scope.reset();
            }

            $scope.appRestore.busy = false;
        });
    };

    $scope.showUninstall = function (app) {
        $scope.reset();

        $scope.appUninstall.app = app;

        $('#appUninstallModal').modal('show');
    };

    $scope.doUninstall = function () {
        $scope.appUninstall.busy = true;
        $scope.appUninstall.error.password = null;

        Client.uninstallApp($scope.appUninstall.app.id, $scope.appUninstall.password, function (error) {
            if (error && error.statusCode === 403) {
                $scope.appUninstall.password = '';
                $scope.appUninstall.error.password = true;
                $scope.appUninstallForm.password.$setPristine();
                $('#appUninstallPasswordInput').focus();
            } else if (error) {
                Client.error(error);
            } else {
                $('#appUninstallModal').modal('hide');
                $scope.reset();
            }

            $scope.appUninstall.busy = false;
        });
    };

    $scope.showUpdate = function (app) {
        $scope.reset();

        $scope.appUpdate.app = app;

        AppStore.getManifest(app.appStoreId, function (error, manifest) {
            if (error) return console.error(error);

            $scope.appUpdate.manifest = angular.copy(manifest);

            // ensure we always operate on objects here
            app.portBindings = app.portBindings || {};
            app.manifest.tcpPorts = app.manifest.tcpPorts || {};
            manifest.tcpPorts = manifest.tcpPorts || {};

            // Activate below two lines for testing the UI
            // manifest.tcpPorts['TEST_HTTP'] = { defaultValue: 1337, description: 'HTTP server'};
            // app.manifest.tcpPorts['TEST_FOOBAR'] = { defaultValue: 1338, description: 'FOOBAR server'};
            // app.portBindings['TEST_SSH'] = 1339;

            var portBindingsInfo = {};                  // Portbinding map only for information
            var portBindings = {};                      // This is the actual model holding the env:port pair
            var portBindingsEnabled = {};               // This is the actual model holding the enabled/disabled flag
            var obsoletePortBindings = {};              // Info map for obsolete port bindings, this is for display use only and thus not in the model
            var portsChanged = false;
            var env;

            // detect new portbindings and copy all from manifest.tcpPorts
            for (env in manifest.tcpPorts) {
                portBindingsInfo[env] = manifest.tcpPorts[env];
                if (!app.manifest.tcpPorts[env]) {
                    portBindingsInfo[env].isNew = true;
                    portBindingsEnabled[env] = true;

                    // use default integer port value in model
                    portBindings[env] = manifest.tcpPorts[env].defaultValue || 0;

                    portsChanged = true;
                } else {
                    // detect if the port binding was enabled
                    if (app.portBindings[env]) {
                        portBindings[env] = app.portBindings[env];
                        portBindingsEnabled[env] = true;
                    } else {
                        portBindings[env] = manifest.tcpPorts[env].defaultValue || 0;
                        portBindingsEnabled[env] = false;
                    }
                }
            }

            // detect obsolete portbindings (mappings in app.portBindings, but not anymore in manifest.tcpPorts)
            for (env in app.manifest.tcpPorts) {
                // only list the port if it is not in the new manifest and was enabled previously
                if (!manifest.tcpPorts[env] && app.portBindings[env]) {
                    obsoletePortBindings[env] = app.portBindings[env];
                    portsChanged = true;
                }
            }

            // now inject the maps into the $scope, we only show those if ports have changed
            $scope.appUpdate.portBindings = portBindings;                 // always inject the model, so it gets used in the actual update call
            $scope.appUpdate.portBindingsEnabled = portBindingsEnabled;   // always inject the model, so it gets used in the actual update call

            if (portsChanged) {
                $scope.appUpdate.portBindingsInfo = portBindingsInfo;
                $scope.appUpdate.obsoletePortBindings = obsoletePortBindings;
            } else {
                $scope.appUpdate.portBindingsInfo = {};
                $scope.appUpdate.obsoletePortBindings = {};
            }

            $('#appUpdateModal').modal('show');
        });
    };

    $scope.doUpdate = function (form) {
        $scope.appUpdate.error.password = null;
        $scope.appUpdate.busy = true;

        // only use enabled ports from portBindings
        var finalPortBindings = {};
        for (var env in $scope.appUpdate.portBindings) {
            if ($scope.appUpdate.portBindingsEnabled[env]) {
                finalPortBindings[env] = $scope.appUpdate.portBindings[env];
            }
        }

        Client.updateApp($scope.appUpdate.app.id, $scope.appUpdate.manifest, finalPortBindings, $scope.appUpdate.password, function (error) {
            if (error && error.statusCode === 403) {
                $scope.appUpdate.password = '';
                $scope.appUpdate.error.password = true;
            } else if (error) {
                Client.error(error);
            } else {
                $scope.appUpdate.app = {};
                $scope.appUpdate.password = '';

                form.$setPristine();
                form.$setUntouched();

                $('#appUpdateModal').modal('hide');
            }

            $scope.appUpdate.busy = false;
        });
    };

    $scope.renderAccessRestrictionUser = function (userId) {
        var user = $scope.users.filter(function (u) { return u.id === userId; })[0];

        // user not found
        if (!user) return userId;

        return user.username ? user.username : user.email;
    };

    $scope.cancel = function () {
        window.history.back();
    };

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

    Client.refreshUserInfo(function (error) {
        if (error) return console.error(error);

        if ($scope.user.admin) {
            fetchUsers();
            fetchGroups();
        }
    });

    // setup all the dialog focus handling
    ['appConfigureModal', 'appUninstallModal', 'appUpdateModal', 'appRestoreModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
