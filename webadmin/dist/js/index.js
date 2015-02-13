'use strict';

/* global angular:false */

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'base64', 'angular-md5']);

// setup all major application routes
app.config(function ($routeProvider) {
    $routeProvider.when('/', {
        redirectTo: '/dashboard'
    }).when('/dashboard', {
        controller: 'DashboardController',
        templateUrl: 'views/dashboard.html'
    }).when('/usercreate', {
        controller: 'UserCreateController',
        templateUrl: 'views/usercreate.html'
    }).when('/userpassword', {
        controller: 'UserPasswordController',
        templateUrl: 'views/userpassword.html'
    }).when('/userlist', {
        controller: 'UserListController',
        templateUrl: 'views/userlist.html'
    }).when('/appstore', {
        controller: 'AppStoreController',
        templateUrl: 'views/appstore.html'
    }).when('/app/:appStoreId/install', {
        controller: 'AppInstallController',
        templateUrl: 'views/appinstall.html'
    }).when('/app/:appId/configure', {
        controller: 'AppConfigureController',
        templateUrl: 'views/appconfigure.html'
    }).when('/app/:appId/details', {
        controller: 'AppDetailsController',
        templateUrl: 'views/appdetails.html'
    }).when('/settings', {
        controller: 'SettingsController',
        templateUrl: 'views/settings.html'
    }).when('/graphs', {
        controller: 'GraphsController',
        templateUrl: 'views/graphs.html'
    }).when('/security', {
        controller: 'SecurityController',
        templateUrl: 'views/security.html'
    }).otherwise({ redirectTo: '/'});
});

app.filter('installationActive', function() {
    return function(input) {
        if (input === 'error') return false;
        if (input === 'installed') return false;
        return true;
    };
});

app.filter('installationStateLabel', function() {
    return function(input) {
        if (input === 'error') return 'Error';
        if (input === 'subdomain_error') return 'Error';
        if (input === 'installed') return 'Installed';
        if (input === 'downloading_image') return 'Downloading';
        if (input === 'pending_install') return 'Installing';
        if (input === 'pending_uninstall') return 'Uninstalling';
        if (input === 'creating_container') return 'Container';
        if (input === 'downloading_manifest') return 'Manifest';
        if (input === 'creating_volume') return 'Volume';
        if (input === 'registering_subdomain') return 'Subdomain';
        if (input === 'allocated_oauth_credentials') return 'OAuth';

        return input;
    };
});

app.filter('accessRestrictionLabel', function() {
    return function(input) {
        if (input === '') return 'public';
        if (input === 'roleUser') return 'private';
        if (input === 'roleAdmin') return 'private (Admins only)';

        return input;
    };
});

// custom directive for dynamic names in forms
// See http://stackoverflow.com/questions/23616578/issue-registering-form-control-with-interpolated-name#answer-23617401
app.directive('laterName', function () {                   // (2)
    return {
        restrict: 'A',
        require: ['?ngModel', '^?form'],                   // (3)
        link: function postLink(scope, elem, attrs, ctrls) {
            attrs.$set('name', attrs.laterName);

            var modelCtrl = ctrls[0];                      // (3)
            var formCtrl  = ctrls[1];                      // (3)
            if (modelCtrl && formCtrl) {
                modelCtrl.$name = attrs.name;              // (4)
                formCtrl.$addControl(modelCtrl);           // (2)
                scope.$on('$destroy', function () {
                    formCtrl.$removeControl(modelCtrl);    // (5)
                });
            }
        }
    };
});
'use strict';

/* global angular */
/* global EventSource */

angular.module('Application').service('Client', function ($http, md5) {
    var client = null;

    function ClientError(statusCode, message) {
        Error.call(this);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        if (typeof message == 'string') {
            this.message = message;
        } else {
            this.message = JSON.stringify(message);
        }
    }

    function defaultErrorHandler(callback) {
        return function (data, status) {
            if (status === 401) return client.logout();
            callback(new ClientError(status, data));
        };
    }

    function Client() {
        this._ready = false;
        this._configListener = [];
        this._readyListener = [];
        this._userInfo = {
            username: null,
            email: null,
            admin: false
        };
        this._token = null;
        this._clientId = 'cid-webadmin';
        this._clientSecret = 'unused';
        this._config = {
            apiServerOrigin: null,
            webServerOrigin: null,
            fqdn: null,
            ip: null,
            revision: null,
            update: null,
            isDev: false,
            isUpdating: false
        };
        this._installedApps = [];

        this.setToken(localStorage.token);
    }

    Client.prototype.setReady = function () {
        if (this._ready) return;

        this._ready = true;
        this._readyListener.forEach(function (callback) {
            callback();
        });
    };

    Client.prototype.onReady = function (callback) {
        if (this._ready) callback();
        this._readyListener.push(callback);
    };

    Client.prototype.onConfig = function (callback) {
        this._configListener.push(callback);
        callback(this._config);
    };

    Client.prototype.setUserInfo = function (userInfo) {
        // In order to keep the angular bindings alive, set each property individually
        this._userInfo.username = userInfo.username;
        this._userInfo.email = userInfo.email;
        this._userInfo.admin = !!userInfo.admin;
        this._userInfo.gravatar = 'https://www.gravatar.com/avatar/' + md5.createHash(userInfo.email.toLowerCase()) + '.jpg?s=24&d=mm';
    };

    Client.prototype.setConfig = function (config) {
        // In order to keep the angular bindings alive, set each property individually (TODO: just use angular.copy ?)
        this._config.apiServerOrigin = config.apiServerOrigin;
        this._config.webServerOrigin = config.webServerOrigin;
        this._config.version = config.version;
        this._config.fqdn = config.fqdn;
        this._config.ip = config.ip;
        this._config.revision = config.revision;
        this._config.update = config.update;
        this._config.isDev = config.isDev;
        this._config.isUpdating = config.isUpdating;

        var that = this;

        this._configListener.forEach(function (callback) {
            callback(that._config);
        });
    };

    Client.prototype.getInstalledApps = function () {
        return this._installedApps;
    };

    Client.prototype.getUserInfo = function () {
        return this._userInfo;
    };

    Client.prototype.getConfig = function () {
        return this._config;
    };

    Client.prototype.setToken = function (token) {
        $http.defaults.headers.common.Authorization = 'Bearer ' + token;
        if (!token) localStorage.removeItem('token');
        else localStorage.token = token;
        this._token = token;
    };

    /*
     * Rest API wrappers
     */
    Client.prototype.config = function (callback) {
        $http.get('/api/v1/cloudron/config').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.userInfo = function (callback) {
        $http.get('/api/v1/profile').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.installApp = function (id, password, title, config, callback) {
        var that = this;
        var data = { appStoreId: id, password: password, location: config.location, portBindings: config.portBindings, accessRestriction: config.accessRestriction };
        $http.post('/api/v1/apps/install', data).success(function (data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));

            // put new app with amended title in cache
            data.manifest = { title: title };
            that._installedApps.push(data);

            callback(null, data.id);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.configureApp = function (id, password, config, callback) {
        var data = { appId: id, password: password, location: config.location, portBindings: config.portBindings, accessRestriction: config.accessRestriction };
        $http.post('/api/v1/apps/' + id + '/configure', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.updateApp = function (id, callback) {
        $http.post('/api/v1/apps/' + id + '/update', { }).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.startApp = function (id, callback) {
        var data = { };
        $http.post('/api/v1/apps/' + id + '/start', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.stopApp = function (id, callback) {
        var data = { };
        $http.post('/api/v1/apps/' + id + '/stop', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.version = function (callback) {
        $http.get('/api/v1/cloudron/status').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.isServerFirstTime = function (callback) {
        $http.get('/api/v1/cloudron/status').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, !data.activated);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getNakedDomain = function (callback) {
        $http.get('/api/v1/settings/naked_domain')
        .success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.appid);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setNakedDomain = function (appid, callback) {
        $http.post('/api/v1/settings/naked_domain', { appid: appid }).success(function (data, status) {
            if (status !== 204) return callback(new ClientError(status));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getApps = function (callback) {
        $http.get('/api/v1/apps').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.apps);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getApp = function (appId, callback) {
        var appFound = null;
        this._installedApps.some(function (app) {
            if (app.id === appId) {
                appFound = app;
                return true;
            } else {
                return false;
            }
        });

        if (appFound) return callback(null, appFound);
        else return callback(new Error('App not found'));
    };

    Client.prototype.removeApp = function (appId, callback) {
        $http.post('/api/v1/apps/' + appId + '/uninstall').success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getAppLogStream = function (appId) {
        var source = new EventSource('/api/v1/apps/' + appId + '/logstream');
        return source;
    };

    Client.prototype.getAppLogUrl = function (appId) {
        return '/api/v1/apps/' + appId + '/logs?access_token=' + this._token;
    };

    Client.prototype.setAdmin = function (username, admin, callback) {
        var payload = {
            username: username,
            admin: admin
        };

        $http.post('/api/v1/users/' + username + '/admin', payload).success(function (data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createAdmin = function (username, password, email, callback) {
        var payload = {
            username: username,
            password: password,
            email: email
        };

        var that = this;

        $http.post('/api/v1/cloudron/activate', payload).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));

            that.setToken(data.token);
            that.setUserInfo({ username: username, email: email, admin: true });

            callback(null, data.activated);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.listUsers = function (callback) {
        $http.get('/api/v1/users').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.stats = function (callback) {
        $http.get('/api/v1/cloudron/stats').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getOAuthClients = function (callback) {
        $http.get('/api/v1/oauth/clients').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.clients);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.delTokensByClientId = function (id, callback) {
        $http.delete('/api/v1/oauth/clients/' + id + '/tokens').success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.update = function (callback) {
        $http.get('/api/v1/cloudron/update').success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.reboot = function (callback) {
        $http.get('/api/v1/cloudron/reboot').success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.backup = function (callback) {
        $http.post('/api/v1/cloudron/backups').success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setCertificate = function (certificateFile, keyFile, callback) {
        console.log('will set certificate');

        var fd = new FormData();
        fd.append('certificate', certificateFile);
        fd.append('key', keyFile);

        $http.post('/api/v1/cloudron/certificate', fd, {
            headers: { 'Content-Type': undefined },
            transformRequest: angular.identity
        }).success(function(data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.graphs = function (targets, from, callback) {
        var config = {
            params: {
                target: targets,
                format: 'json',
                from: from
            }
        };

        $http.get('/api/v1/cloudron/graphs', config).success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createUser = function (username, email, callback) {
        var data = {
            username: username,
            email: email
        };

        $http.post('/api/v1/users', data).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.removeUser = function (username, password, callback) {
        var data = {
            username: username,
            password: password
        };

        $http({ method: 'DELETE', url: '/api/v1/users/' + username, data: data, headers: { 'Content-Type': 'application/json' }}).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changePassword = function (currentPassword, newPassword, callback) {
        var data = {
            password: currentPassword,
            newPassword: newPassword
        };

        $http.post('/api/v1/users/' + this._userInfo.username + '/password', data).success(function(data, status) {
            if (status !== 204 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.refreshConfig = function (callback) {
        var that = this;

        callback = typeof callback === 'function' ? callback : function () {};

        this.config(function (error, result) {
            if (error) return callback(error);

            that.setConfig(result);
            callback(null);
        });
    };

    Client.prototype.refreshInstalledApps = function (callback) {
        var that = this;

        callback = typeof callback === 'function' ? callback : function () {};

        this.getApps(function (error, apps) {
            if (error) return callback(error);

            // insert or update new apps
            apps.forEach(function (app) {
                var found = false;

                for (var i = 0; i < that._installedApps.length; ++i) {
                    if (that._installedApps[i].id === app.id) {
                        found = i;
                        break;
                    }
                }

                if (found !== false) {
                    angular.copy(app, that._installedApps[found]);
                } else {
                    that._installedApps.push(app);
                }
            });

            // filter out old entries, going backwards to allow splicing
            for(var i = that._installedApps.length - 1; i >= 0; --i) {
                if (!apps.some(function (elem) { return (elem.id === that._installedApps[i].id); })) {
                    that._installedApps.splice(i, 1);
                }

            }

            callback(null);
        });
    };

    Client.prototype.logout = function () {
        this.setToken(null);
        this._userInfo = {};

        // logout from OAuth session
        window.location.href = '/api/v1/session/logout';
    };

    Client.prototype.exchangeCodeForToken = function (authCode, callback) {
        var data = {
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: window.location.origin,
            client_id: this._clientId,
            client_secret: this._clientSecret
        };

        $http.post('/api/v1/oauth/token?response_type=token&client_id=' + this._clientId, data).success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));

            callback(null, data.access_token);
        }).error(defaultErrorHandler(callback));
    };

    client = new Client();
    return client;
});

'use strict';

/* global angular:false */

angular.module('Application').service('AppStore', function ($http, Client) {

    function AppStoreError(statusCode, message) {
        Error.call(this);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        if (typeof message == 'string') {
            this.message = message;
        } else {
            this.message = JSON.stringify(message);
        }
    }

    function AppStore() {
        this._appsCache = { };
    }

    AppStore.prototype.getApps = function (callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(500, 'Not yet initialized'));

        var that = this;

        $http.get(Client.getConfig().apiServerOrigin + '/api/v1/appstore/apps').success(function (data, status) {
            if (status !== 200) return callback(new AppStoreError(status, data));

            // TODO remove old apps
            data.apps.forEach(function (app) {
                if (that._appsCache[app.id]) return;

                that._appsCache[app.id] = app;
            });

            return callback(null, that._appsCache);
        }).error(function (data, status) {
            return callback(new AppStoreError(status, data));
        });
    };

    AppStore.prototype.getAppById = function (appId, callback) {
        if (appId in this._appsCache) return callback(null, this._appsCache[appId]);

        var that = this;

        this.getApps(function (error) {
            if (error) return callback(error);
            if (appId in that._appsCache) return callback(null, that._appsCache[appId]);

            callback(new AppStoreError(404, 'Not found'));
        });
    };

    AppStore.prototype.getManifest = function (appId, callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(500, 'Not yet initialized'));

        var manifestUrl = Client.getConfig().apiServerOrigin + '/api/v1/appstore/apps/' + appId + '/manifest';
        console.log('Getting the manifest of ', appId, manifestUrl);
        $http.get(manifestUrl).success(function (data, status) {
            return callback(null, data);
        }).error(function (data, status) {
            return callback(new AppStoreError(status, data));
        });
    };
    return new AppStore();
});

/* exported MainController */

'use strict';

var MainController = function ($scope, $route, $interval, Client) {
    $scope.initialized = false;
    $scope.userInfo = Client.getUserInfo();
    $scope.installedApps = Client.getInstalledApps();

    $scope.isActive = function (url) {
        if (!$route.current) return false;
        return $route.current.$$route.originalPath.indexOf(url) === 0;
    };

    $scope.logout = function (event) {
        event.stopPropagation();
        $scope.initialized = false;
        Client.logout();
    };

    $scope.login = function () {
        var callbackURL = window.location.origin + '/login_callback.html';
        var scope = 'root,profile,apps,roleAdmin';
        window.location.href = '/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + Client._clientId + '&redirect_uri=' + callbackURL + '&scope=' + scope;
    };

    $scope.setup = function () {
        window.location.href = '/setup.html';
    };

    $scope.error = function (error) {
        console.error(error);
        window.location.href = '/error.html';
    };

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) return $scope.error(error);
        if (isFirstTime) return $scope.setup();

        // we use the config request as an indicator if the token is still valid
        // TODO we should probably attach such a handler for each request, as the token can get invalid
        // at any time!
        if (localStorage.token) {
            Client.refreshConfig(function (error) {
                if (error && error.statusCode === 401) return $scope.login();
                if (error) return $scope.error(error);

                Client.userInfo(function (error, result) {
                    if (error) return $scope.error(error);

                    Client.setUserInfo(result);

                    Client.refreshInstalledApps(function (error) {
                        if (error) return $scope.error(error);

                        // kick off installed apps and config polling
                        var refreshAppsTimer = $interval(Client.refreshInstalledApps.bind(Client), 2000);
                        var refreshConfigTimer = $interval(Client.refreshConfig.bind(Client), 5000);

                        $scope.$on('$destroy', function () {
                            $interval.cancel(refreshAppsTimer);
                            $interval.cancel(refreshConfigTimer);
                        });

                        // now mark the Client to be ready
                        Client.setReady();

                        // now show UI
                        $scope.initialized = true;
                    });
                });
            });
        } else {
            $scope.login();
        }
    });

    Client.onConfig(function (config) {
        if (config.isUpdating) {
            // wait till the view has loaded until showing a modal dialog
            $scope.$on('$viewContentLoaded', function() {
                $scope.$parent.initialized = false;
                $('#updateProgressModal').modal('show');

                window.setTimeout(window.location.reload.bind(window.location, true), 10000);
            });
        }
    });
};

/* exported AppConfigureController */

'use strict';

var AppConfigureController = function ($scope, $routeParams, Client) {
    $scope.app = null;
    $scope.password = '';
    $scope.location = '';
    $scope.accessRestriction = '';
    $scope.disabled = false;
    $scope.error = {};
    $scope.domain = '';
    $scope.portBindings = { };

    $scope.configureApp = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        var portBindings = { };
        for (var containerPort in $scope.portBindings) {
            portBindings[containerPort] = $scope.portBindings[containerPort].hostPort;
        }

        Client.configureApp($routeParams.appId, $scope.password, { location: $scope.location, portBindings: portBindings, accessRestriction: $scope.accessRestriction }, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.error.password = 'Wrong password provided.';
                    $scope.password = '';
                } else {
                    $scope.error.name = 'App with the name ' + $scope.app.name + ' cannot be configured.';
                }

                $scope.disabled = false;
                return;
            }

            window.location.replace('#/app/' + $routeParams.appId + '/details');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };

    Client.onReady(function () {
        $scope.domain = Client.getConfig().fqdn;

        Client.getApp($routeParams.appId, function (error, app) {
            $scope.error = error || { };
            if (error) return;

            $scope.app = app;
            $scope.location = app.location;
            $scope.portBindings = app.manifest.tcpPorts;
            $scope.accessRestriction = app.accessRestriction;
            for (var containerPort in $scope.portBindings) {
                $scope.portBindings[containerPort].hostPort = app.portBindings[containerPort];
            }
        });
    });

    document.getElementById('inputLocation').focus();
};

/* global $:true */
/* exported AppDetailsController */

'use strict';

var AppDetailsController = function ($scope, $http, $routeParams, Client) {
    $scope.app = {};
    $scope.initialized = false;
    $scope.updateAvailable = false;
    $scope.activeTab = 'day';

    $scope.startApp = function () {
        Client.startApp($routeParams.appId, function (error) {
            if (error) console.error(error);
        });
    };

    $scope.stopApp = function () {
        Client.stopApp($routeParams.appId, function (error) {
            if (error) console.error(error);
        });
    };

    $scope.updateApp = function () {
        Client.updateApp($routeParams.appId, function (error) {
            if (error) console.error(error);
        });
    };

    $scope.deleteApp = function () {
        $('#deleteAppModal').modal('hide');

        Client.removeApp($routeParams.appId, function (error) {
            if (error) console.error(error);
            window.location.href = '#/';
        });
    };

    function renderCpu(activeTab, cpuData) {
        var transformedCpu = [ ];

        if (cpuData && cpuData.datapoints) transformedCpu = cpuData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

        var cpuGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'CpuChart'),
            renderer: 'area',
            width: 580,
            height: 250,
            min: 0,
            max: 100,
            series: [{
                color: 'steelblue',
                data: transformedCpu || [ ],
                name: 'cpu'
            }]
        });

        var cpuXAxis = new Rickshaw.Graph.Axis.Time({ graph: cpuGraph });
        var cpuYAxis = new Rickshaw.Graph.Axis.Y({
            graph: cpuGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'CpuYAxis'),
        });

        var cpuHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: cpuGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y).toFixed(2) + '%<br>';
                return content;
            }
        });

        cpuGraph.render();
    }

    function renderMemory(activeTab, memoryData) {
        var transformedMemory = [ ];

        if (memoryData && memoryData.datapoints) transformedMemory = memoryData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

        var memoryGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'MemoryChart'),
            renderer: 'area',
            width: 580,
            height: 250,
            min: 0,
            max: 2 * 1024 * 1024 * 1024, // 2gb
            series: [ {
                color: 'steelblue',
                data: transformedMemory || [ ],
                name: 'memory'
            } ]
        } );

        var memoryXAxis = new Rickshaw.Graph.Axis.Time({ graph: memoryGraph });
        var memoryYAxis = new Rickshaw.Graph.Axis.Y({
            graph: memoryGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'MemoryYAxis'),
        });

        var memoryHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: memoryGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y/(1024*1024)).toFixed(2) + 'MB<br>';
                return content;
            }
        });

        memoryGraph.render();
    }

    function renderDisk(activeTab, diskData) {
        var transformedDisk = [ ];

        if (diskData && diskData.datapoints) transformedDisk = diskData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

        var diskGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'DiskChart'),
            renderer: 'area',
            width: 580,
            height: 250,
            min: 0,
            max: 30 * 1024 * 1024 * 1024, // 30gb
            series: [{
                color: 'steelblue',
                data: transformedDisk || [ ],
                name: 'apps'
            }]
        } );

        var diskXAxis = new Rickshaw.Graph.Axis.Time({ graph: diskGraph });
        var diskYAxis = new Rickshaw.Graph.Axis.Y({
            graph: diskGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'DiskYAxis'),
        });

        var diskHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: diskGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y/(1024 * 1024)).toFixed(2) + 'MB<br>';
                return content;
            }
        });

        var diskLegend = new Rickshaw.Graph.Legend({
            graph: diskGraph,
            element: document.getElementById(activeTab + 'DiskLegend')
        });

        diskGraph.render();
    }

    $scope.updateGraphs = function () {
        var cpuUsageTarget =
            'nonNegativeDerivative(' +
                'sumSeries(collectd.localhost.table-' + $scope.app.id + '-cpu.gauge-user,' +
                          'collectd.localhost.table-' + $scope.app.id + '-cpu.gauge-system))'; // assumes 100 jiffies per sec (USER_HZ)

        var memoryUsageTarget = 'collectd.localhost.table-' + $scope.app.id + '-memory.gauge-max_usage_in_bytes';

        var diskUsageTarget = 'collectd.localhost.filecount-' + $scope.app.id + '-appdata.bytes';

        var activeTab = $scope.activeTab;
        var from = '-24hours';
        switch (activeTab) {
        case 'day': from = '-24hours'; break;
        case 'month': from = '-1month'; break;
        case 'year': from = '-1year'; break;
        default: console.log('internal errror');
        }

        Client.graphs([ cpuUsageTarget, memoryUsageTarget, diskUsageTarget ], from, function (error, data) {
            if (error) return console.log(error);

            renderCpu(activeTab, data[0]);

            renderMemory(activeTab, data[1]);

            renderDisk(activeTab, data[2]);
        });
    };

    Client.onReady(function () {

        Client.getApp($routeParams.appId, function (error, app) {
            if (error) {
                console.error(error);
                window.location.href = '#/';
                return;
            }

            $scope.app = app;
            $scope.appLogUrl = Client.getAppLogUrl(app.id);

            if (Client.getConfig().update && Client.getConfig().update.apps) {
                $scope.updateAvailable = Client.getConfig().update.apps.some(function (x) {
                    return x.appId === $scope.app.appStoreId && x.version !== $scope.app.version;
                });
            }

            $scope.updateGraphs();

            $scope.initialized = true;
        });
    });
};

/* exported AppInstallController */

'use strict';

var AppInstallController = function ($scope, $routeParams, Client, AppStore, $timeout) {
    $scope.app = null;
    $scope.password = '';
    $scope.location = '';
    $scope.accessRestriction = '';
    $scope.disabled = false;
    $scope.error = { };
    $scope.domain = '';
    $scope.portBindings = { };
    $scope.hostPortMin = 1025;
    $scope.hostPortMax = 9999;

    Client.onReady(function () {
        $scope.domain = Client.getConfig().fqdn;

        AppStore.getAppById($routeParams.appStoreId, function (error, app) {
            $scope.error = error || { };
            if (error) return;
            $scope.app = app;
        });

        AppStore.getManifest($routeParams.appStoreId, function (error, manifest) {
            $scope.error = error || { };
            if (error) return;
            $scope.portBindings = manifest.tcpPorts;
            $scope.accessRestriction = manifest.accessRestriction || '';
            // default setting is to map ports as they are in manifest
            for (var port in $scope.portBindings) {
                $scope.portBindings[port].hostPort = parseInt(port);
            }
        });
    });

    $scope.installApp = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        var portBindings = { };
        for (var port in $scope.portBindings) {
            portBindings[port] = $scope.portBindings[port].hostPort;
        }

        Client.installApp($routeParams.appStoreId, $scope.password, $scope.app.title, { location: $scope.location, portBindings: portBindings, accessRestriction: $scope.accessRestriction }, function (error, appId) {
            if (error) {
                if (error.statusCode === 409) {
                    $scope.error.name = 'Application already exists.';
                } else if (error.statusCode === 403) {
                    $scope.error.password = 'Wrong password provided.';
                    $scope.password = '';
                } else {
                    $scope.error.name = 'App with the name ' + $scope.app.name + ' cannot be installed.';
                }

                $scope.disabled = false;
                return;
            }

            window.location.replace('#/app/' + appId + '/details');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };

    // hack for autofocus with angular
    $scope.$on('$viewContentLoaded', function () {
        $timeout(function () { $('input[autofocus]:visible:first').focus(); }, 1000);
    });
};

/* exported AppStoreController */

'use strict';

var AppStoreController = function ($scope, $location, Client, AppStore) {
    $scope.LOADING = 1;
    $scope.ERROR = 2;
    $scope.LOADED = 3;

    $scope.loadStatus = $scope.LOADING;
    $scope.loadError = '';

    $scope.apps = [];

    $scope.refresh = function () {
        Client.refreshInstalledApps(function (error) {
            if (error) {
                $scope.loadStatus = $scope.ERROR;
                $scope.loadError = error.message;
                return;
            }

            AppStore.getApps(function (error, apps) {
                if (error) {
                    $scope.loadStatus = $scope.ERROR;
                    $scope.loadError = error.message;
                    return;
                }

                for (var app in apps) {
                    var found = false;
                    for (var i = 0; i < $scope.apps.length; ++i) {
                        if (apps[app].id === $scope.apps[i].id) {
                            found = true;
                            break;
                        }
                    }

                    if (!found) $scope.apps.push(apps[app]);
                }

                $scope.apps.forEach(function (app, index) {
                    if (Client._installedApps) app.installed = Client._installedApps.some(function (a) { return a.appStoreId === app.id; });
                    if (!apps[app.id]) $scope.apps.splice(index, 1);
                });

                $scope.loadStatus = $scope.LOADED;
            });
        });
    };

    $scope.installApp = function (app) {
        $location.path('/app/' + app.id + '/install');
    };

    $scope.openApp = function (app) {
        for (var i = 0; i < Client._installedApps.length; i++) {
            if (Client._installedApps[i].appStoreId === app.id) {
                window.open('https://' + Client._installedApps[i].fqdn);
                break;
            }
        }
    };

    Client.onConfig(function (config) {
        if (!config.apiServerOrigin) return;
        $scope.refresh();
    });
};

/* exported DashboardController */

'use strict';

var DashboardController = function () {

};

/* exported GraphsController */
/* global $:true */

'use strict';

var GraphsController = function ($scope, Client) {
    $scope.activeTab = 'day';

    var cpuUsageTarget = 'transformNull(' +
    'scale(divideSeries(' +
        'sumSeries(collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user),' +
        'sumSeries(collectd.localhost.cpu-0.cpu-idle,collectd.localhost.cpu-0.cpu-system,collectd.localhost.cpu-0.cpu-nice,collectd.localhost.cpu-0.cpu-user,collectd.localhost.cpu-0.cpu-wait)), 100), 0)';

    var networkUsageTxTarget = 'transformNull(collectd.localhost.interface-eth0.if_octets.tx, 0)';
    var networkUsageRxTarget = 'transformNull(collectd.localhost.interface-eth0.if_octets.rx, 0)';

    var diskUsageAppsUsedTarget = 'transformNull(collectd.localhost.df-loop0.df_complex-used, 0)';
    var diskUsageDataUsedTarget = 'transformNull(collectd.localhost.df-loop1.df_complex-used, 0)';

    function renderCpu(activeTab, cpuData) {
        var transformedCpu = [ ];

        if (cpuData && cpuData.datapoints) transformedCpu = cpuData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

        var cpuGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'CpuChart'),
            renderer: 'area',
            width: 580,
            height: 250,
            min: 0,
            max: 100,
            series: [{
                color: 'steelblue',
                data: transformedCpu,
                name: 'cpu'
            }]
        });

        var cpuXAxis = new Rickshaw.Graph.Axis.Time({ graph: cpuGraph });
        var cpuYAxis = new Rickshaw.Graph.Axis.Y({
            graph: cpuGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'CpuYAxis'),
        });

        var cpuHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: cpuGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y).toFixed(2) + '%<br>';
                return content;
            }
        });

        cpuGraph.render();
    }

    function renderNetwork(activeTab, txData, rxData) {
        var transformedTx = [ ], transformedRx = [ ];

        if (txData && txData.datapoints) transformedTx = txData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });
        if (rxData && rxData.datapoints) transformedRx = rxData.datapoints.map(function (point) { return { y: point[0], x: point[1] } });

        var networkGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'NetworkChart'),
            renderer: 'area',
            width: 580,
            height: 250,
            series: [ {
                color: 'steelblue',
                data: transformedTx,
                name: 'tx'
            }, {
                color: 'green',
                data: transformedRx,
                name: 'rx'
            } ]
        } );

        var networkXAxis = new Rickshaw.Graph.Axis.Time({ graph: networkGraph });
        var networkYAxis = new Rickshaw.Graph.Axis.Y({
            graph: networkGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'NetworkYAxis'),
        });

        var networkHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: networkGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y/1024).toFixed(2) + 'KB<br>';
                return content;
            }
        });

        networkGraph.render();
    }

    function renderDisk(activeTab, appsUsedData, dataUsedData) {
        var transformedAppsUsed = [ ], transformedDataUsed = [ ];

        if (appsUsedData && appsUsedData.datapoints) {
            transformedAppsUsed = appsUsedData.datapoints.map(function (point) { return { y: point[0], x: point[1] }; });
        }

        if (dataUsedData && dataUsedData.datapoints) {
            transformedDataUsed = dataUsedData.datapoints.map(function (point) { return { y: point[0], x: point[1] }; });
        }

        var diskGraph = new Rickshaw.Graph({
            element: document.querySelector('#' + activeTab + 'DiskChart'),
            renderer: 'area',
            width: 580,
            height: 250,
            min: 0,
            max: 30 * 1024 * 1024 * 1024, // 30gb
            series: [{
                color: 'steelblue',
                data: transformedAppsUsed,
                name: 'apps'
            }, {
                color: 'green',
                data: transformedDataUsed,
                name: 'data'
            }]
        } );

        var diskXAxis = new Rickshaw.Graph.Axis.Time({ graph: diskGraph });
        var diskYAxis = new Rickshaw.Graph.Axis.Y({
            graph: diskGraph,
            orientation: 'left',
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            element: document.getElementById(activeTab + 'DiskYAxis'),
        });

        var diskHoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: diskGraph,
            formatter: function(series, x, y) {
                var swatch = '<span class="detail_swatch" style="background-color: ' + series.color + '"></span>';
                var content = swatch + series.name + ": " + new Number(y/(1024 * 1024 * 1024)).toFixed(2) + 'GB<br>';
                return content;
            }
        });

        var diskLegend = new Rickshaw.Graph.Legend({
            graph: diskGraph,
            element: document.getElementById(activeTab + 'DiskLegend')
        });

        diskGraph.render();
    }

    $scope.updateGraphs = function () {
        var activeTab = $scope.activeTab;
       var from = '-24hours';
        switch (activeTab) {
        case 'day': from = '-24hours'; break;
        case 'month': from = '-1month'; break;
        case 'year': from = '-1year'; break;
        default: console.log('internal errror');
        }

        Client.graphs([ cpuUsageTarget, networkUsageTxTarget, networkUsageRxTarget, diskUsageAppsUsedTarget, diskUsageDataUsedTarget ], from, function (error, data) {
            if (error) return console.log(error);

            renderCpu(activeTab, data[0]);

            renderNetwork(activeTab, data[1], data[2]);

            renderDisk(activeTab, data[3], data[4]);
        });
    };

    Client.onReady($scope.updateGraphs);
};


/* exported SecurityController */
/* global $ */

'use strict';

var SecurityController = function ($scope, Client) {
    $scope.activeClients = [];
    $scope.tokenInUse = null;

    $scope.removeAccessTokens = function (client, event) {
        client._busy = true;

        Client.delTokensByClientId(client.id, function (error) {
            if (error) return console.error(error);
            $(event.target).addClass('disabled');
            client._busy = false;
        });
    };

    Client.onReady(function () {
        $scope.tokenInUse = Client._token;

        Client.getOAuthClients(function (error, activeClients) {
            if (error) return console.error(error);

            $scope.activeClients = activeClients;
        });
    });
};

/* exported SettingsController */
/* global $:true */

'use strict';


var SettingsController = function ($scope, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();
    $scope.nakedDomainApp = null;
    $scope.drives = [];
    $scope.certificateFile = null;
    $scope.certificateFileName = '';
    $scope.keyFile = null;
    $scope.keyFileName = '';

    $scope.setNakedDomain = function () {
        var appid = $scope.nakedDomainApp ? $scope.nakedDomainApp.id : 'admin';

        Client.setNakedDomain(appid, function (error) {
            if (error) return console.error('Error setting naked domain', error);
        });
    };

    $scope.changePassword = function () {
        window.location.href = '#/userpassword';
    };

    $scope.backup = function () {
        $('#backupProgressModal').modal('show');
        $scope.$parent.initialized = false;

        Client.backup(function (error) {
            if (error) console.error(error);

            // now start query
            function checkIfDone() {
                Client.version(function (error) {
                    if (error) return window.setTimeout(checkIfDone, 1000);

                    $('#backupProgressModal').modal('hide');
                    $scope.$parent.initialized = true;
                });
            }

            window.setTimeout(checkIfDone, 5000);
        });
    };

    $scope.reboot = function () {
        $('#rebootModal').modal('hide');
        $('#rebootProgressModal').modal('show');
        $scope.$parent.initialized = false;

        Client.reboot(function (error) {
            if (error) console.error(error);

            // now start query
            function checkIfDone() {
                Client.version(function (error) {
                    if (error) return window.setTimeout(checkIfDone, 1000);

                    $('#rebootProgressModal').modal('hide');

                    window.setTimeout(window.location.reload.bind(window.location, true), 1000);
                });
            }

            window.setTimeout(checkIfDone, 5000);
        });
    };

    $scope.update = function () {
        $('#updateModal').modal('hide');
        $('#updateProgressModal').modal('show');
        $scope.$parent.initialized = false;

        Client.update(function (error) {
            if (error) console.error(error);

            // the modal dialog is never hidden. the main page will reload itself when update has finished
        });
    };

    document.getElementById('idCertificate').onchange = function (event) {
        $scope.$apply(function () {
            $scope.certificateFile = event.target.files[0];
            $scope.certificateFileName = event.target.files[0].name;
        });
    };

    document.getElementById('idKey').onchange = function (event) {
        $scope.$apply(function () {
            $scope.keyFile = event.target.files[0];
            $scope.keyFileName = event.target.files[0].name;
        });
    };

    $scope.setCertificate = function () {
        console.log('Will set the certificate');

        if (!$scope.certificateFile) return console.log('Certificate not set');
        if (!$scope.keyFile) return console.log('Key not set');

        Client.setCertificate($scope.certificateFile, $scope.keyFile, function (error) {
            if (error) return console.log(error);

            window.setTimeout(window.location.reload.bind(window.location, true), 3000);
        });
    };

    Client.onConfig(function () {
        $scope.tokenInUse = Client._token;

        Client.getApps(function (error, apps) {
            if (error) console.error('Error loading app list');
            $scope.apps = apps;

            Client.getNakedDomain(function (error, appid) {
                if (error) return console.error(error);

                $scope.nakedDomainApp = null;
                for (var i = 0; i < $scope.apps.length; i++) {
                    if ($scope.apps[i].id === appid) {
                        $scope.nakedDomainApp = $scope.apps[i];
                        break;
                    }
                }
            });

            Client.stats(function (error, stats) {
                if (error) return console.error(error);

                $scope.drives = stats.drives;
            });
        });
    });
};

/* exported UserCreateController */

'use strict';

function UserCreateController ($scope, $routeParams, Client) {
    $scope.disabled = false;

    $scope.username = '';
    $scope.email = '';
    $scope.alreadyTaken = '';

    $scope.submit = function () {
        $scope.alreadyTaken = '';

        $scope.disabled = true;

        Client.createUser($scope.username, $scope.email, function (error) {
            if (error && error.statusCode === 409) {
                $scope.alreadyTaken = $scope.username;
                return console.error('Username already taken');
            }
            if (error) console.error('Unable to create user.', error);

            window.location.href = '#/userlist';
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

/* exported UserListController */
/* global $:true */

'use strict';

function UserListController ($scope, Client) {
    $scope.ready = false;
    $scope.users = [];
    $scope.userInfo = Client.getUserInfo();
    $scope.userDeleteForm = {
        username: '',
        password: ''
    };

    $scope.isMe = function (user) {
        return user.username === Client.getUserInfo().username;
    };

    $scope.isAdmin = function (user) {
        return !!user.admin;
    };

    $scope.toggleAdmin = function (user) {
        Client.setAdmin(user.username, !user.admin, function (error) {
            if (error) return console.error(error);

            user.admin = !user.admin;
        });
    };

    $scope.deleteUser = function (user) {
        // TODO add busy indicator and block form
        if ($scope.userDeleteForm.username !== user.username) return console.error('Username does not match');

        Client.removeUser(user.username, $scope.userDeleteForm.password, function (error) {
            if (error && error.statusCode === 401) return console.error('Wrong password');
            if (error) return console.error('Unable to delete user.', error);

            $('#userDeleteModal-' + user.username).modal('hide');

            refresh();
        });
    };

    function refresh() {
        Client.listUsers(function (error, result) {
            if (error) return console.error('Unable to get user listing.', error);

            $scope.users = result.users;
            $scope.ready = true;
        });
    }

    $scope.addUser = function () {
        window.location.href = '#/usercreate';
    };

    refresh();
}

/* exported UserPasswordController */

'use strict';

function UserPasswordController ($scope, $routeParams, Client) {
    $scope.active = false;
    $scope.currentPassword = '';
    $scope.newPassword = '';
    $scope.repeatPassword = '';
    $scope.validationClass = {};

    $scope.submit = function () {
        $scope.validationClass.currentPassword = '';
        $scope.validationClass.newPassword = '';
        $scope.validationClass.repeatPassword = '';

        if ($scope.newPassword !== $scope.repeatPassword) {
            document.getElementById('inputRepeatPassword').focus();
            $scope.validationClass.repeatPassword = 'has-error';
            $scope.repeatPassword = '';
            return;
        }

        $scope.active = true;
        Client.changePassword($scope.currentPassword, $scope.newPassword, function (error) {
            if (error && error.statusCode === 403) {
                document.getElementById('inputCurrentPassword').focus();
                $scope.validationClass.currentPassword = 'has-error';
                $scope.currentPassword = '';
                $scope.newPassword = '';
                $scope.repeatPassword = '';
            } else if (error) {
                console.error('Unable to change password.', error);
            } else {
                window.history.back();
            }

            $scope.active = false;
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };

    document.getElementById('inputCurrentPassword').focus();
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIiwiY2xpZW50LmpzIiwiYXBwc3RvcmUuanMiLCJtYWluLmpzIiwiYXBwY29uZmlndXJlLmpzIiwiYXBwZGV0YWlscy5qcyIsImFwcGluc3RhbGwuanMiLCJkYXNoYm9hcmQuanMiLCJncmFwaHMuanMiLCJzZWN1cml0eS5qcyIsInNldHRpbmdzLmpzIiwidXNlcmNyZWF0ZS5qcyIsInVzZXJsaXN0LmpzIiwidXNlcnBhc3N3b3JkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN2R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3hkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDekZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN0TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FKMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FLckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbi8qIGdsb2JhbCBhbmd1bGFyOmZhbHNlICovXG5cbi8vIGNyZWF0ZSBtYWluIGFwcGxpY2F0aW9uIG1vZHVsZVxudmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicsIFsnbmdSb3V0ZScsICduZ0FuaW1hdGUnLCAnYmFzZTY0JywgJ2FuZ3VsYXItbWQ1J10pO1xuXG4vLyBzZXR1cCBhbGwgbWFqb3IgYXBwbGljYXRpb24gcm91dGVzXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkcm91dGVQcm92aWRlcikge1xuICAgICRyb3V0ZVByb3ZpZGVyLndoZW4oJy8nLCB7XG4gICAgICAgIHJlZGlyZWN0VG86ICcvZGFzaGJvYXJkJ1xuICAgIH0pLndoZW4oJy9kYXNoYm9hcmQnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdEYXNoYm9hcmRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9kYXNoYm9hcmQuaHRtbCdcbiAgICB9KS53aGVuKCcvdXNlcmNyZWF0ZScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1VzZXJDcmVhdGVDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy91c2VyY3JlYXRlLmh0bWwnXG4gICAgfSkud2hlbignL3VzZXJwYXNzd29yZCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1VzZXJQYXNzd29yZENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3VzZXJwYXNzd29yZC5odG1sJ1xuICAgIH0pLndoZW4oJy91c2VybGlzdCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1VzZXJMaXN0Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvdXNlcmxpc3QuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwc3RvcmUnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdBcHBTdG9yZUNvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcHN0b3JlLmh0bWwnXG4gICAgfSkud2hlbignL2FwcC86YXBwU3RvcmVJZC9pbnN0YWxsJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwSW5zdGFsbENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcGluc3RhbGwuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwLzphcHBJZC9jb25maWd1cmUnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdBcHBDb25maWd1cmVDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBjb25maWd1cmUuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwLzphcHBJZC9kZXRhaWxzJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwRGV0YWlsc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcGRldGFpbHMuaHRtbCdcbiAgICB9KS53aGVuKCcvc2V0dGluZ3MnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdTZXR0aW5nc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3NldHRpbmdzLmh0bWwnXG4gICAgfSkud2hlbignL2dyYXBocycsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0dyYXBoc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2dyYXBocy5odG1sJ1xuICAgIH0pLndoZW4oJy9zZWN1cml0eScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1NlY3VyaXR5Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3Mvc2VjdXJpdHkuaHRtbCdcbiAgICB9KS5vdGhlcndpc2UoeyByZWRpcmVjdFRvOiAnLyd9KTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdpbnN0YWxsYXRpb25BY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZXJyb3InKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2luc3RhbGxlZCcpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdpbnN0YWxsYXRpb25TdGF0ZUxhYmVsJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Vycm9yJykgcmV0dXJuICdFcnJvcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3N1YmRvbWFpbl9lcnJvcicpIHJldHVybiAnRXJyb3InO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdpbnN0YWxsZWQnKSByZXR1cm4gJ0luc3RhbGxlZCc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Rvd25sb2FkaW5nX2ltYWdlJykgcmV0dXJuICdEb3dubG9hZGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3BlbmRpbmdfaW5zdGFsbCcpIHJldHVybiAnSW5zdGFsbGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3BlbmRpbmdfdW5pbnN0YWxsJykgcmV0dXJuICdVbmluc3RhbGxpbmcnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdjcmVhdGluZ19jb250YWluZXInKSByZXR1cm4gJ0NvbnRhaW5lcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Rvd25sb2FkaW5nX21hbmlmZXN0JykgcmV0dXJuICdNYW5pZmVzdCc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2NyZWF0aW5nX3ZvbHVtZScpIHJldHVybiAnVm9sdW1lJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncmVnaXN0ZXJpbmdfc3ViZG9tYWluJykgcmV0dXJuICdTdWJkb21haW4nO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdhbGxvY2F0ZWRfb2F1dGhfY3JlZGVudGlhbHMnKSByZXR1cm4gJ09BdXRoJztcblxuICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgfTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdhY2Nlc3NSZXN0cmljdGlvbkxhYmVsJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJycpIHJldHVybiAncHVibGljJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncm9sZVVzZXInKSByZXR1cm4gJ3ByaXZhdGUnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyb2xlQWRtaW4nKSByZXR1cm4gJ3ByaXZhdGUgKEFkbWlucyBvbmx5KSc7XG5cbiAgICAgICAgcmV0dXJuIGlucHV0O1xuICAgIH07XG59KTtcblxuLy8gY3VzdG9tIGRpcmVjdGl2ZSBmb3IgZHluYW1pYyBuYW1lcyBpbiBmb3Jtc1xuLy8gU2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjM2MTY1NzgvaXNzdWUtcmVnaXN0ZXJpbmctZm9ybS1jb250cm9sLXdpdGgtaW50ZXJwb2xhdGVkLW5hbWUjYW5zd2VyLTIzNjE3NDAxXG5hcHAuZGlyZWN0aXZlKCdsYXRlck5hbWUnLCBmdW5jdGlvbiAoKSB7ICAgICAgICAgICAgICAgICAgIC8vICgyKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICAgIHJlcXVpcmU6IFsnP25nTW9kZWwnLCAnXj9mb3JtJ10sICAgICAgICAgICAgICAgICAgIC8vICgzKVxuICAgICAgICBsaW5rOiBmdW5jdGlvbiBwb3N0TGluayhzY29wZSwgZWxlbSwgYXR0cnMsIGN0cmxzKSB7XG4gICAgICAgICAgICBhdHRycy4kc2V0KCduYW1lJywgYXR0cnMubGF0ZXJOYW1lKTtcblxuICAgICAgICAgICAgdmFyIG1vZGVsQ3RybCA9IGN0cmxzWzBdOyAgICAgICAgICAgICAgICAgICAgICAvLyAoMylcbiAgICAgICAgICAgIHZhciBmb3JtQ3RybCAgPSBjdHJsc1sxXTsgICAgICAgICAgICAgICAgICAgICAgLy8gKDMpXG4gICAgICAgICAgICBpZiAobW9kZWxDdHJsICYmIGZvcm1DdHJsKSB7XG4gICAgICAgICAgICAgICAgbW9kZWxDdHJsLiRuYW1lID0gYXR0cnMubmFtZTsgICAgICAgICAgICAgIC8vICg0KVxuICAgICAgICAgICAgICAgIGZvcm1DdHJsLiRhZGRDb250cm9sKG1vZGVsQ3RybCk7ICAgICAgICAgICAvLyAoMilcbiAgICAgICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBmb3JtQ3RybC4kcmVtb3ZlQ29udHJvbChtb2RlbEN0cmwpOyAgICAvLyAoNSlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59KTsiLCIndXNlIHN0cmljdCc7XG5cbi8qIGdsb2JhbCBhbmd1bGFyICovXG4vKiBnbG9iYWwgRXZlbnRTb3VyY2UgKi9cblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuc2VydmljZSgnQ2xpZW50JywgZnVuY3Rpb24gKCRodHRwLCBtZDUpIHtcbiAgICB2YXIgY2xpZW50ID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIENsaWVudEVycm9yKHN0YXR1c0NvZGUsIG1lc3NhZ2UpIHtcbiAgICAgICAgRXJyb3IuY2FsbCh0aGlzKTtcbiAgICAgICAgdGhpcy5uYW1lID0gdGhpcy5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgICAgICB0aGlzLnN0YXR1c0NvZGUgPSBzdGF0dXNDb2RlO1xuICAgICAgICBpZiAodHlwZW9mIG1lc3NhZ2UgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2UgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09IDQwMSkgcmV0dXJuIGNsaWVudC5sb2dvdXQoKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBDbGllbnQoKSB7XG4gICAgICAgIHRoaXMuX3JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyID0gW107XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIgPSBbXTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8gPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogbnVsbCxcbiAgICAgICAgICAgIGVtYWlsOiBudWxsLFxuICAgICAgICAgICAgYWRtaW46IGZhbHNlXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2xpZW50SWQgPSAnY2lkLXdlYmFkbWluJztcbiAgICAgICAgdGhpcy5fY2xpZW50U2VjcmV0ID0gJ3VudXNlZCc7XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IHtcbiAgICAgICAgICAgIGFwaVNlcnZlck9yaWdpbjogbnVsbCxcbiAgICAgICAgICAgIHdlYlNlcnZlck9yaWdpbjogbnVsbCxcbiAgICAgICAgICAgIGZxZG46IG51bGwsXG4gICAgICAgICAgICBpcDogbnVsbCxcbiAgICAgICAgICAgIHJldmlzaW9uOiBudWxsLFxuICAgICAgICAgICAgdXBkYXRlOiBudWxsLFxuICAgICAgICAgICAgaXNEZXY6IGZhbHNlLFxuICAgICAgICAgICAgaXNVcGRhdGluZzogZmFsc2VcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5faW5zdGFsbGVkQXBwcyA9IFtdO1xuXG4gICAgICAgIHRoaXMuc2V0VG9rZW4obG9jYWxTdG9yYWdlLnRva2VuKTtcbiAgICB9XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFJlYWR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5fcmVhZHkpIHJldHVybjtcblxuICAgICAgICB0aGlzLl9yZWFkeSA9IHRydWU7XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLm9uUmVhZHkgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlYWR5KSBjYWxsYmFjaygpO1xuICAgICAgICB0aGlzLl9yZWFkeUxpc3RlbmVyLnB1c2goY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLm9uQ29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyLnB1c2goY2FsbGJhY2spO1xuICAgICAgICBjYWxsYmFjayh0aGlzLl9jb25maWcpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFVzZXJJbmZvID0gZnVuY3Rpb24gKHVzZXJJbmZvKSB7XG4gICAgICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIGFuZ3VsYXIgYmluZGluZ3MgYWxpdmUsIHNldCBlYWNoIHByb3BlcnR5IGluZGl2aWR1YWxseVxuICAgICAgICB0aGlzLl91c2VySW5mby51c2VybmFtZSA9IHVzZXJJbmZvLnVzZXJuYW1lO1xuICAgICAgICB0aGlzLl91c2VySW5mby5lbWFpbCA9IHVzZXJJbmZvLmVtYWlsO1xuICAgICAgICB0aGlzLl91c2VySW5mby5hZG1pbiA9ICEhdXNlckluZm8uYWRtaW47XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvLmdyYXZhdGFyID0gJ2h0dHBzOi8vd3d3LmdyYXZhdGFyLmNvbS9hdmF0YXIvJyArIG1kNS5jcmVhdGVIYXNoKHVzZXJJbmZvLmVtYWlsLnRvTG93ZXJDYXNlKCkpICsgJy5qcGc/cz0yNCZkPW1tJztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRDb25maWcgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIGFuZ3VsYXIgYmluZGluZ3MgYWxpdmUsIHNldCBlYWNoIHByb3BlcnR5IGluZGl2aWR1YWxseSAoVE9ETzoganVzdCB1c2UgYW5ndWxhci5jb3B5ID8pXG4gICAgICAgIHRoaXMuX2NvbmZpZy5hcGlTZXJ2ZXJPcmlnaW4gPSBjb25maWcuYXBpU2VydmVyT3JpZ2luO1xuICAgICAgICB0aGlzLl9jb25maWcud2ViU2VydmVyT3JpZ2luID0gY29uZmlnLndlYlNlcnZlck9yaWdpbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLnZlcnNpb24gPSBjb25maWcudmVyc2lvbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLmZxZG4gPSBjb25maWcuZnFkbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLmlwID0gY29uZmlnLmlwO1xuICAgICAgICB0aGlzLl9jb25maWcucmV2aXNpb24gPSBjb25maWcucmV2aXNpb247XG4gICAgICAgIHRoaXMuX2NvbmZpZy51cGRhdGUgPSBjb25maWcudXBkYXRlO1xuICAgICAgICB0aGlzLl9jb25maWcuaXNEZXYgPSBjb25maWcuaXNEZXY7XG4gICAgICAgIHRoaXMuX2NvbmZpZy5pc1VwZGF0aW5nID0gY29uZmlnLmlzVXBkYXRpbmc7XG5cbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyLmZvckVhY2goZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayh0aGF0Ll9jb25maWcpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRJbnN0YWxsZWRBcHBzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faW5zdGFsbGVkQXBwcztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRVc2VySW5mbyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3VzZXJJbmZvO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldENvbmZpZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbmZpZztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRUb2tlbiA9IGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgICAkaHR0cC5kZWZhdWx0cy5oZWFkZXJzLmNvbW1vbi5BdXRob3JpemF0aW9uID0gJ0JlYXJlciAnICsgdG9rZW47XG4gICAgICAgIGlmICghdG9rZW4pIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCd0b2tlbicpO1xuICAgICAgICBlbHNlIGxvY2FsU3RvcmFnZS50b2tlbiA9IHRva2VuO1xuICAgICAgICB0aGlzLl90b2tlbiA9IHRva2VuO1xuICAgIH07XG5cbiAgICAvKlxuICAgICAqIFJlc3QgQVBJIHdyYXBwZXJzXG4gICAgICovXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jb25maWcgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL2NvbmZpZycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS51c2VySW5mbyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvcHJvZmlsZScpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5pbnN0YWxsQXBwID0gZnVuY3Rpb24gKGlkLCBwYXNzd29yZCwgdGl0bGUsIGNvbmZpZywgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgZGF0YSA9IHsgYXBwU3RvcmVJZDogaWQsIHBhc3N3b3JkOiBwYXNzd29yZCwgbG9jYXRpb246IGNvbmZpZy5sb2NhdGlvbiwgcG9ydEJpbmRpbmdzOiBjb25maWcucG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogY29uZmlnLmFjY2Vzc1Jlc3RyaWN0aW9uIH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy9pbnN0YWxsJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICAvLyBwdXQgbmV3IGFwcCB3aXRoIGFtZW5kZWQgdGl0bGUgaW4gY2FjaGVcbiAgICAgICAgICAgIGRhdGEubWFuaWZlc3QgPSB7IHRpdGxlOiB0aXRsZSB9O1xuICAgICAgICAgICAgdGhhdC5faW5zdGFsbGVkQXBwcy5wdXNoKGRhdGEpO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmlkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNvbmZpZ3VyZUFwcCA9IGZ1bmN0aW9uIChpZCwgcGFzc3dvcmQsIGNvbmZpZywgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7IGFwcElkOiBpZCwgcGFzc3dvcmQ6IHBhc3N3b3JkLCBsb2NhdGlvbjogY29uZmlnLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IGNvbmZpZy5wb3J0QmluZGluZ3MsIGFjY2Vzc1Jlc3RyaWN0aW9uOiBjb25maWcuYWNjZXNzUmVzdHJpY3Rpb24gfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvY29uZmlndXJlJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVwZGF0ZUFwcCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvdXBkYXRlJywgeyB9KS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc3RhcnRBcHAgPSBmdW5jdGlvbiAoaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0geyB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy9zdGFydCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdG9wQXBwID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvc3RvcCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS52ZXJzaW9uID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0dXMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuaXNTZXJ2ZXJGaXJzdFRpbWUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3N0YXR1cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgIWRhdGEuYWN0aXZhdGVkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldE5ha2VkRG9tYWluID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9zZXR0aW5ncy9uYWtlZF9kb21haW4nKVxuICAgICAgICAuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hcHBpZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uIChhcHBpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9zZXR0aW5ncy9uYWtlZF9kb21haW4nLCB7IGFwcGlkOiBhcHBpZCB9KS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwcyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvYXBwcycpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYXBwcyk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHAgPSBmdW5jdGlvbiAoYXBwSWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBhcHBGb3VuZCA9IG51bGw7XG4gICAgICAgIHRoaXMuX2luc3RhbGxlZEFwcHMuc29tZShmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgICAgICBpZiAoYXBwLmlkID09PSBhcHBJZCkge1xuICAgICAgICAgICAgICAgIGFwcEZvdW5kID0gYXBwO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChhcHBGb3VuZCkgcmV0dXJuIGNhbGxiYWNrKG51bGwsIGFwcEZvdW5kKTtcbiAgICAgICAgZWxzZSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdBcHAgbm90IGZvdW5kJykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlbW92ZUFwcCA9IGZ1bmN0aW9uIChhcHBJZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvdW5pbnN0YWxsJykuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcExvZ1N0cmVhbSA9IGZ1bmN0aW9uIChhcHBJZCkge1xuICAgICAgICB2YXIgc291cmNlID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy9sb2dzdHJlYW0nKTtcbiAgICAgICAgcmV0dXJuIHNvdXJjZTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHBMb2dVcmwgPSBmdW5jdGlvbiAoYXBwSWQpIHtcbiAgICAgICAgcmV0dXJuICcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy9sb2dzP2FjY2Vzc190b2tlbj0nICsgdGhpcy5fdG9rZW47XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0QWRtaW4gPSBmdW5jdGlvbiAodXNlcm5hbWUsIGFkbWluLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIGFkbWluOiBhZG1pblxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMvJyArIHVzZXJuYW1lICsgJy9hZG1pbicsIHBheWxvYWQpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jcmVhdGVBZG1pbiA9IGZ1bmN0aW9uICh1c2VybmFtZSwgcGFzc3dvcmQsIGVtYWlsLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgICAgICAgIGVtYWlsOiBlbWFpbFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2FjdGl2YXRlJywgcGF5bG9hZCkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIHRoYXQuc2V0VG9rZW4oZGF0YS50b2tlbik7XG4gICAgICAgICAgICB0aGF0LnNldFVzZXJJbmZvKHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBlbWFpbDogZW1haWwsIGFkbWluOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFjdGl2YXRlZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5saXN0VXNlcnMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL3VzZXJzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnN0YXRzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRPQXV0aENsaWVudHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL29hdXRoL2NsaWVudHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuY2xpZW50cyk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5kZWxUb2tlbnNCeUNsaWVudElkID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5kZWxldGUoJy9hcGkvdjEvb2F1dGgvY2xpZW50cy8nICsgaWQgKyAnL3Rva2VucycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vdXBkYXRlJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlYm9vdCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vcmVib290Jykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmJhY2t1cCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2JhY2t1cHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0Q2VydGlmaWNhdGUgPSBmdW5jdGlvbiAoY2VydGlmaWNhdGVGaWxlLCBrZXlGaWxlLCBjYWxsYmFjaykge1xuICAgICAgICBjb25zb2xlLmxvZygnd2lsbCBzZXQgY2VydGlmaWNhdGUnKTtcblxuICAgICAgICB2YXIgZmQgPSBuZXcgRm9ybURhdGEoKTtcbiAgICAgICAgZmQuYXBwZW5kKCdjZXJ0aWZpY2F0ZScsIGNlcnRpZmljYXRlRmlsZSk7XG4gICAgICAgIGZkLmFwcGVuZCgna2V5Jywga2V5RmlsZSk7XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9jZXJ0aWZpY2F0ZScsIGZkLCB7XG4gICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiB1bmRlZmluZWQgfSxcbiAgICAgICAgICAgIHRyYW5zZm9ybVJlcXVlc3Q6IGFuZ3VsYXIuaWRlbnRpdHlcbiAgICAgICAgfSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ3JhcGhzID0gZnVuY3Rpb24gKHRhcmdldHMsIGZyb20sIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBjb25maWcgPSB7XG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldHMsXG4gICAgICAgICAgICAgICAgZm9ybWF0OiAnanNvbicsXG4gICAgICAgICAgICAgICAgZnJvbTogZnJvbVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9ncmFwaHMnLCBjb25maWcpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY3JlYXRlVXNlciA9IGZ1bmN0aW9uICh1c2VybmFtZSwgZW1haWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgICAgZW1haWw6IGVtYWlsXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS91c2VycycsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVVc2VyID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBwYXNzd29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZDogcGFzc3dvcmRcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cCh7IG1ldGhvZDogJ0RFTEVURScsIHVybDogJy9hcGkvdjEvdXNlcnMvJyArIHVzZXJuYW1lLCBkYXRhOiBkYXRhLCBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfX0pLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNoYW5nZVBhc3N3b3JkID0gZnVuY3Rpb24gKGN1cnJlbnRQYXNzd29yZCwgbmV3UGFzc3dvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgcGFzc3dvcmQ6IGN1cnJlbnRQYXNzd29yZCxcbiAgICAgICAgICAgIG5ld1Bhc3N3b3JkOiBuZXdQYXNzd29yZFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMvJyArIHRoaXMuX3VzZXJJbmZvLnVzZXJuYW1lICsgJy9wYXNzd29yZCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWZyZXNoQ29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICBjYWxsYmFjayA9IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogZnVuY3Rpb24gKCkge307XG5cbiAgICAgICAgdGhpcy5jb25maWcoZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNhbGxiYWNrKGVycm9yKTtcblxuICAgICAgICAgICAgdGhhdC5zZXRDb25maWcocmVzdWx0KTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWZyZXNoSW5zdGFsbGVkQXBwcyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgY2FsbGJhY2sgPSB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IGZ1bmN0aW9uICgpIHt9O1xuXG4gICAgICAgIHRoaXMuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNhbGxiYWNrKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gaW5zZXJ0IG9yIHVwZGF0ZSBuZXcgYXBwc1xuICAgICAgICAgICAgYXBwcy5mb3JFYWNoKGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhhdC5faW5zdGFsbGVkQXBwcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhhdC5faW5zdGFsbGVkQXBwc1tpXS5pZCA9PT0gYXBwLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChmb3VuZCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgYW5ndWxhci5jb3B5KGFwcCwgdGhhdC5faW5zdGFsbGVkQXBwc1tmb3VuZF0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMucHVzaChhcHApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IG9sZCBlbnRyaWVzLCBnb2luZyBiYWNrd2FyZHMgdG8gYWxsb3cgc3BsaWNpbmdcbiAgICAgICAgICAgIGZvcih2YXIgaSA9IHRoYXQuX2luc3RhbGxlZEFwcHMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFwcHMuc29tZShmdW5jdGlvbiAoZWxlbSkgeyByZXR1cm4gKGVsZW0uaWQgPT09IHRoYXQuX2luc3RhbGxlZEFwcHNbaV0uaWQpOyB9KSkge1xuICAgICAgICAgICAgICAgICAgICB0aGF0Ll9pbnN0YWxsZWRBcHBzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zZXRUb2tlbihudWxsKTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8gPSB7fTtcblxuICAgICAgICAvLyBsb2dvdXQgZnJvbSBPQXV0aCBzZXNzaW9uXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9hcGkvdjEvc2Vzc2lvbi9sb2dvdXQnO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmV4Y2hhbmdlQ29kZUZvclRva2VuID0gZnVuY3Rpb24gKGF1dGhDb2RlLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgICAgICAgY29kZTogYXV0aENvZGUsXG4gICAgICAgICAgICByZWRpcmVjdF91cmk6IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4sXG4gICAgICAgICAgICBjbGllbnRfaWQ6IHRoaXMuX2NsaWVudElkLFxuICAgICAgICAgICAgY2xpZW50X3NlY3JldDogdGhpcy5fY2xpZW50U2VjcmV0XG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9vYXV0aC90b2tlbj9yZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD0nICsgdGhpcy5fY2xpZW50SWQsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFjY2Vzc190b2tlbik7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgY2xpZW50ID0gbmV3IENsaWVudCgpO1xuICAgIHJldHVybiBjbGllbnQ7XG59KTtcbiIsIi8qIGV4cG9ydGVkIEFwcFN0b3JlQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBBcHBTdG9yZUNvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCAkbG9jYXRpb24sIENsaWVudCwgQXBwU3RvcmUpIHtcbiAgICAkc2NvcGUuTE9BRElORyA9IDE7XG4gICAgJHNjb3BlLkVSUk9SID0gMjtcbiAgICAkc2NvcGUuTE9BREVEID0gMztcblxuICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkxPQURJTkc7XG4gICAgJHNjb3BlLmxvYWRFcnJvciA9ICcnO1xuXG4gICAgJHNjb3BlLmFwcHMgPSBbXTtcblxuICAgICRzY29wZS5yZWZyZXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQucmVmcmVzaEluc3RhbGxlZEFwcHMoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUubG9hZFN0YXR1cyA9ICRzY29wZS5FUlJPUjtcbiAgICAgICAgICAgICAgICAkc2NvcGUubG9hZEVycm9yID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIEFwcFN0b3JlLmdldEFwcHMoZnVuY3Rpb24gKGVycm9yLCBhcHBzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkVSUk9SO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUubG9hZEVycm9yID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGFwcCBpbiBhcHBzKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8ICRzY29wZS5hcHBzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXBwc1thcHBdLmlkID09PSAkc2NvcGUuYXBwc1tpXS5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghZm91bmQpICRzY29wZS5hcHBzLnB1c2goYXBwc1thcHBdKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUuYXBwcy5mb3JFYWNoKGZ1bmN0aW9uIChhcHAsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChDbGllbnQuX2luc3RhbGxlZEFwcHMpIGFwcC5pbnN0YWxsZWQgPSBDbGllbnQuX2luc3RhbGxlZEFwcHMuc29tZShmdW5jdGlvbiAoYSkgeyByZXR1cm4gYS5hcHBTdG9yZUlkID09PSBhcHAuaWQ7IH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFwcHNbYXBwLmlkXSkgJHNjb3BlLmFwcHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkxPQURFRDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmluc3RhbGxBcHAgPSBmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgICRsb2NhdGlvbi5wYXRoKCcvYXBwLycgKyBhcHAuaWQgKyAnL2luc3RhbGwnKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLm9wZW5BcHAgPSBmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgQ2xpZW50Ll9pbnN0YWxsZWRBcHBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoQ2xpZW50Ll9pbnN0YWxsZWRBcHBzW2ldLmFwcFN0b3JlSWQgPT09IGFwcC5pZCkge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5vcGVuKCdodHRwczovLycgKyBDbGllbnQuX2luc3RhbGxlZEFwcHNbaV0uZnFkbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uQ29uZmlnKGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgaWYgKCFjb25maWcuYXBpU2VydmVyT3JpZ2luKSByZXR1cm47XG4gICAgICAgICRzY29wZS5yZWZyZXNoKCk7XG4gICAgfSk7XG59O1xuIiwiLyogZXhwb3J0ZWQgTWFpbkNvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgTWFpbkNvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGUsICRpbnRlcnZhbCwgQ2xpZW50KSB7XG4gICAgJHNjb3BlLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgJHNjb3BlLnVzZXJJbmZvID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLmluc3RhbGxlZEFwcHMgPSBDbGllbnQuZ2V0SW5zdGFsbGVkQXBwcygpO1xuXG4gICAgJHNjb3BlLmlzQWN0aXZlID0gZnVuY3Rpb24gKHVybCkge1xuICAgICAgICBpZiAoISRyb3V0ZS5jdXJyZW50KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiAkcm91dGUuY3VycmVudC4kJHJvdXRlLm9yaWdpbmFsUGF0aC5pbmRleE9mKHVybCkgPT09IDA7XG4gICAgfTtcblxuICAgICRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICRzY29wZS5pbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICAgICBDbGllbnQubG9nb3V0KCk7XG4gICAgfTtcblxuICAgICRzY29wZS5sb2dpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGNhbGxiYWNrVVJMID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArICcvbG9naW5fY2FsbGJhY2suaHRtbCc7XG4gICAgICAgIHZhciBzY29wZSA9ICdyb290LHByb2ZpbGUsYXBwcyxyb2xlQWRtaW4nO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvYXBpL3YxL29hdXRoL2RpYWxvZy9hdXRob3JpemU/cmVzcG9uc2VfdHlwZT1jb2RlJmNsaWVudF9pZD0nICsgQ2xpZW50Ll9jbGllbnRJZCArICcmcmVkaXJlY3RfdXJpPScgKyBjYWxsYmFja1VSTCArICcmc2NvcGU9JyArIHNjb3BlO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2V0dXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9zZXR1cC5odG1sJztcbiAgICB9O1xuXG4gICAgJHNjb3BlLmVycm9yID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvZXJyb3IuaHRtbCc7XG4gICAgfTtcblxuICAgIENsaWVudC5pc1NlcnZlckZpcnN0VGltZShmdW5jdGlvbiAoZXJyb3IsIGlzRmlyc3RUaW1lKSB7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG4gICAgICAgIGlmIChpc0ZpcnN0VGltZSkgcmV0dXJuICRzY29wZS5zZXR1cCgpO1xuXG4gICAgICAgIC8vIHdlIHVzZSB0aGUgY29uZmlnIHJlcXVlc3QgYXMgYW4gaW5kaWNhdG9yIGlmIHRoZSB0b2tlbiBpcyBzdGlsbCB2YWxpZFxuICAgICAgICAvLyBUT0RPIHdlIHNob3VsZCBwcm9iYWJseSBhdHRhY2ggc3VjaCBhIGhhbmRsZXIgZm9yIGVhY2ggcmVxdWVzdCwgYXMgdGhlIHRva2VuIGNhbiBnZXQgaW52YWxpZFxuICAgICAgICAvLyBhdCBhbnkgdGltZSFcbiAgICAgICAgaWYgKGxvY2FsU3RvcmFnZS50b2tlbikge1xuICAgICAgICAgICAgQ2xpZW50LnJlZnJlc2hDb25maWcoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnN0YXR1c0NvZGUgPT09IDQwMSkgcmV0dXJuICRzY29wZS5sb2dpbigpO1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICBDbGllbnQudXNlckluZm8oZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgICAgICBDbGllbnQuc2V0VXNlckluZm8ocmVzdWx0KTtcblxuICAgICAgICAgICAgICAgICAgICBDbGllbnQucmVmcmVzaEluc3RhbGxlZEFwcHMoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiAkc2NvcGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBraWNrIG9mZiBpbnN0YWxsZWQgYXBwcyBhbmQgY29uZmlnIHBvbGxpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWZyZXNoQXBwc1RpbWVyID0gJGludGVydmFsKENsaWVudC5yZWZyZXNoSW5zdGFsbGVkQXBwcy5iaW5kKENsaWVudCksIDIwMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZnJlc2hDb25maWdUaW1lciA9ICRpbnRlcnZhbChDbGllbnQucmVmcmVzaENvbmZpZy5iaW5kKENsaWVudCksIDUwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAkc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHJlZnJlc2hBcHBzVGltZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwocmVmcmVzaENvbmZpZ1RpbWVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBub3cgbWFyayB0aGUgQ2xpZW50IHRvIGJlIHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICBDbGllbnQuc2V0UmVhZHkoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbm93IHNob3cgVUlcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkc2NvcGUubG9naW4oKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgQ2xpZW50Lm9uQ29uZmlnKGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgaWYgKGNvbmZpZy5pc1VwZGF0aW5nKSB7XG4gICAgICAgICAgICAvLyB3YWl0IHRpbGwgdGhlIHZpZXcgaGFzIGxvYWRlZCB1bnRpbCBzaG93aW5nIGEgbW9kYWwgZGlhbG9nXG4gICAgICAgICAgICAkc2NvcGUuJG9uKCckdmlld0NvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcblxuICAgICAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQuYmluZCh3aW5kb3cubG9jYXRpb24sIHRydWUpLCAxMDAwMCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xufTtcbiIsIi8qIGV4cG9ydGVkIEFwcENvbmZpZ3VyZUNvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgQXBwQ29uZmlndXJlQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZVBhcmFtcywgQ2xpZW50KSB7XG4gICAgJHNjb3BlLmFwcCA9IG51bGw7XG4gICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLmxvY2F0aW9uID0gJyc7XG4gICAgJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uID0gJyc7XG4gICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgJHNjb3BlLmVycm9yID0ge307XG4gICAgJHNjb3BlLmRvbWFpbiA9ICcnO1xuICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSB7IH07XG5cbiAgICAkc2NvcGUuY29uZmlndXJlQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9IG51bGw7XG4gICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9IG51bGw7XG5cbiAgICAgICAgdmFyIHBvcnRCaW5kaW5ncyA9IHsgfTtcbiAgICAgICAgZm9yICh2YXIgY29udGFpbmVyUG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICBwb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF0gPSAkc2NvcGUucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdLmhvc3RQb3J0O1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50LmNvbmZpZ3VyZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsICRzY29wZS5wYXNzd29yZCwgeyBsb2NhdGlvbjogJHNjb3BlLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IHBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246ICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gJ1dyb25nIHBhc3N3b3JkIHByb3ZpZGVkLic7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5wYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gJ0FwcCB3aXRoIHRoZSBuYW1lICcgKyAkc2NvcGUuYXBwLm5hbWUgKyAnIGNhbm5vdCBiZSBjb25maWd1cmVkLic7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZSgnIy9hcHAvJyArICRyb3V0ZVBhcmFtcy5hcHBJZCArICcvZGV0YWlscycpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS5kb21haW4gPSBDbGllbnQuZ2V0Q29uZmlnKCkuZnFkbjtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yLCBhcHApIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IGVycm9yIHx8IHsgfTtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuO1xuXG4gICAgICAgICAgICAkc2NvcGUuYXBwID0gYXBwO1xuICAgICAgICAgICAgJHNjb3BlLmxvY2F0aW9uID0gYXBwLmxvY2F0aW9uO1xuICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5ncyA9IGFwcC5tYW5pZmVzdC50Y3BQb3J0cztcbiAgICAgICAgICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9IGFwcC5hY2Nlc3NSZXN0cmljdGlvbjtcbiAgICAgICAgICAgIGZvciAodmFyIGNvbnRhaW5lclBvcnQgaW4gJHNjb3BlLnBvcnRCaW5kaW5ncykge1xuICAgICAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF0uaG9zdFBvcnQgPSBhcHAucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dExvY2F0aW9uJykuZm9jdXMoKTtcbn07XG4iLCIvKiBnbG9iYWwgJDp0cnVlICovXG4vKiBleHBvcnRlZCBBcHBEZXRhaWxzQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBBcHBEZXRhaWxzQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCAkcm91dGVQYXJhbXMsIENsaWVudCkge1xuICAgICRzY29wZS5hcHAgPSB7fTtcbiAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUudXBkYXRlQXZhaWxhYmxlID0gZmFsc2U7XG4gICAgJHNjb3BlLmFjdGl2ZVRhYiA9ICdkYXknO1xuXG4gICAgJHNjb3BlLnN0YXJ0QXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQuc3RhcnRBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc3RvcEFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnN0b3BBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUudXBkYXRlQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQudXBkYXRlQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmRlbGV0ZUFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJCgnI2RlbGV0ZUFwcE1vZGFsJykubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICBDbGllbnQucmVtb3ZlQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy8nO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgY3B1RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRDcHUgPSBbIF07XG5cbiAgICAgICAgaWYgKGNwdURhdGEgJiYgY3B1RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZENwdSA9IGNwdURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBjcHVHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdDcHVDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMTAwLFxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZENwdSB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ2NwdSdcbiAgICAgICAgICAgIH1dXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBjcHVYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogY3B1R3JhcGggfSk7XG4gICAgICAgIHZhciBjcHVZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0NwdVlBeGlzJyksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBjcHVIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogY3B1R3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkpLnRvRml4ZWQoMikgKyAnJTxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjcHVHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJNZW1vcnkoYWN0aXZlVGFiLCBtZW1vcnlEYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZE1lbW9yeSA9IFsgXTtcblxuICAgICAgICBpZiAobWVtb3J5RGF0YSAmJiBtZW1vcnlEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkTWVtb3J5ID0gbWVtb3J5RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIG1lbW9yeUdyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ01lbW9yeUNoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAyICogMTAyNCAqIDEwMjQgKiAxMDI0LCAvLyAyZ2JcbiAgICAgICAgICAgIHNlcmllczogWyB7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkTWVtb3J5IHx8IFsgXSxcbiAgICAgICAgICAgICAgICBuYW1lOiAnbWVtb3J5J1xuICAgICAgICAgICAgfSBdXG4gICAgICAgIH0gKTtcblxuICAgICAgICB2YXIgbWVtb3J5WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IG1lbW9yeUdyYXBoIH0pO1xuICAgICAgICB2YXIgbWVtb3J5WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBtZW1vcnlHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdNZW1vcnlZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbWVtb3J5SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IG1lbW9yeUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LygxMDI0KjEwMjQpKS50b0ZpeGVkKDIpICsgJ01CPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1lbW9yeUdyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkaXNrRGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWREaXNrID0gWyBdO1xuXG4gICAgICAgIGlmIChkaXNrRGF0YSAmJiBkaXNrRGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZERpc2sgPSBkaXNrRGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIGRpc2tHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdEaXNrQ2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDMwICogMTAyNCAqIDEwMjQgKiAxMDI0LCAvLyAzMGdiXG4gICAgICAgICAgICBzZXJpZXM6IFt7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkRGlzayB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ2FwcHMnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIGRpc2tYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogZGlza0dyYXBoIH0pO1xuICAgICAgICB2YXIgZGlza1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0Rpc2tZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvKDEwMjQgKiAxMDI0KSkudG9GaXhlZCgyKSArICdNQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0xlZ2VuZCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5MZWdlbmQoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrTGVnZW5kJylcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGlza0dyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgICRzY29wZS51cGRhdGVHcmFwaHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjcHVVc2FnZVRhcmdldCA9XG4gICAgICAgICAgICAnbm9uTmVnYXRpdmVEZXJpdmF0aXZlKCcgK1xuICAgICAgICAgICAgICAgICdzdW1TZXJpZXMoY29sbGVjdGQubG9jYWxob3N0LnRhYmxlLScgKyAkc2NvcGUuYXBwLmlkICsgJy1jcHUuZ2F1Z2UtdXNlciwnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJ2NvbGxlY3RkLmxvY2FsaG9zdC50YWJsZS0nICsgJHNjb3BlLmFwcC5pZCArICctY3B1LmdhdWdlLXN5c3RlbSkpJzsgLy8gYXNzdW1lcyAxMDAgamlmZmllcyBwZXIgc2VjIChVU0VSX0haKVxuXG4gICAgICAgIHZhciBtZW1vcnlVc2FnZVRhcmdldCA9ICdjb2xsZWN0ZC5sb2NhbGhvc3QudGFibGUtJyArICRzY29wZS5hcHAuaWQgKyAnLW1lbW9yeS5nYXVnZS1tYXhfdXNhZ2VfaW5fYnl0ZXMnO1xuXG4gICAgICAgIHZhciBkaXNrVXNhZ2VUYXJnZXQgPSAnY29sbGVjdGQubG9jYWxob3N0LmZpbGVjb3VudC0nICsgJHNjb3BlLmFwcC5pZCArICctYXBwZGF0YS5ieXRlcyc7XG5cbiAgICAgICAgdmFyIGFjdGl2ZVRhYiA9ICRzY29wZS5hY3RpdmVUYWI7XG4gICAgICAgIHZhciBmcm9tID0gJy0yNGhvdXJzJztcbiAgICAgICAgc3dpdGNoIChhY3RpdmVUYWIpIHtcbiAgICAgICAgY2FzZSAnZGF5JzogZnJvbSA9ICctMjRob3Vycyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdtb250aCc6IGZyb20gPSAnLTFtb250aCc7IGJyZWFrO1xuICAgICAgICBjYXNlICd5ZWFyJzogZnJvbSA9ICctMXllYXInOyBicmVhaztcbiAgICAgICAgZGVmYXVsdDogY29uc29sZS5sb2coJ2ludGVybmFsIGVycnJvcicpO1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50LmdyYXBocyhbIGNwdVVzYWdlVGFyZ2V0LCBtZW1vcnlVc2FnZVRhcmdldCwgZGlza1VzYWdlVGFyZ2V0IF0sIGZyb20sIGZ1bmN0aW9uIChlcnJvciwgZGF0YSkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5sb2coZXJyb3IpO1xuXG4gICAgICAgICAgICByZW5kZXJDcHUoYWN0aXZlVGFiLCBkYXRhWzBdKTtcblxuICAgICAgICAgICAgcmVuZGVyTWVtb3J5KGFjdGl2ZVRhYiwgZGF0YVsxXSk7XG5cbiAgICAgICAgICAgIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkYXRhWzJdKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yLCBhcHApIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvJztcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS5hcHAgPSBhcHA7XG4gICAgICAgICAgICAkc2NvcGUuYXBwTG9nVXJsID0gQ2xpZW50LmdldEFwcExvZ1VybChhcHAuaWQpO1xuXG4gICAgICAgICAgICBpZiAoQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZSAmJiBDbGllbnQuZ2V0Q29uZmlnKCkudXBkYXRlLmFwcHMpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUudXBkYXRlQXZhaWxhYmxlID0gQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZS5hcHBzLnNvbWUoZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHguYXBwSWQgPT09ICRzY29wZS5hcHAuYXBwU3RvcmVJZCAmJiB4LnZlcnNpb24gIT09ICRzY29wZS5hcHAudmVyc2lvbjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgJHNjb3BlLnVwZGF0ZUdyYXBocygpO1xuXG4gICAgICAgICAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG4iLCIvKiBleHBvcnRlZCBBcHBJbnN0YWxsQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBBcHBJbnN0YWxsQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZVBhcmFtcywgQ2xpZW50LCBBcHBTdG9yZSwgJHRpbWVvdXQpIHtcbiAgICAkc2NvcGUuYXBwID0gbnVsbDtcbiAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAkc2NvcGUubG9jYXRpb24gPSAnJztcbiAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSAnJztcbiAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUuZXJyb3IgPSB7IH07XG4gICAgJHNjb3BlLmRvbWFpbiA9ICcnO1xuICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSB7IH07XG4gICAgJHNjb3BlLmhvc3RQb3J0TWluID0gMTAyNTtcbiAgICAkc2NvcGUuaG9zdFBvcnRNYXggPSA5OTk5O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZG9tYWluID0gQ2xpZW50LmdldENvbmZpZygpLmZxZG47XG5cbiAgICAgICAgQXBwU3RvcmUuZ2V0QXBwQnlJZCgkcm91dGVQYXJhbXMuYXBwU3RvcmVJZCwgZnVuY3Rpb24gKGVycm9yLCBhcHApIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IGVycm9yIHx8IHsgfTtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuO1xuICAgICAgICAgICAgJHNjb3BlLmFwcCA9IGFwcDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgQXBwU3RvcmUuZ2V0TWFuaWZlc3QoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsIGZ1bmN0aW9uIChlcnJvciwgbWFuaWZlc3QpIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IGVycm9yIHx8IHsgfTtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuO1xuICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5ncyA9IG1hbmlmZXN0LnRjcFBvcnRzO1xuICAgICAgICAgICAgJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uID0gbWFuaWZlc3QuYWNjZXNzUmVzdHJpY3Rpb24gfHwgJyc7XG4gICAgICAgICAgICAvLyBkZWZhdWx0IHNldHRpbmcgaXMgdG8gbWFwIHBvcnRzIGFzIHRoZXkgYXJlIGluIG1hbmlmZXN0XG4gICAgICAgICAgICBmb3IgKHZhciBwb3J0IGluICRzY29wZS5wb3J0QmluZGluZ3MpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUucG9ydEJpbmRpbmdzW3BvcnRdLmhvc3RQb3J0ID0gcGFyc2VJbnQocG9ydCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgJHNjb3BlLmluc3RhbGxBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gbnVsbDtcbiAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gbnVsbDtcblxuICAgICAgICB2YXIgcG9ydEJpbmRpbmdzID0geyB9O1xuICAgICAgICBmb3IgKHZhciBwb3J0IGluICRzY29wZS5wb3J0QmluZGluZ3MpIHtcbiAgICAgICAgICAgIHBvcnRCaW5kaW5nc1twb3J0XSA9ICRzY29wZS5wb3J0QmluZGluZ3NbcG9ydF0uaG9zdFBvcnQ7XG4gICAgICAgIH1cblxuICAgICAgICBDbGllbnQuaW5zdGFsbEFwcCgkcm91dGVQYXJhbXMuYXBwU3RvcmVJZCwgJHNjb3BlLnBhc3N3b3JkLCAkc2NvcGUuYXBwLnRpdGxlLCB7IGxvY2F0aW9uOiAkc2NvcGUubG9jYXRpb24sIHBvcnRCaW5kaW5nczogcG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uIH0sIGZ1bmN0aW9uIChlcnJvciwgYXBwSWQpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDkpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSAnQXBwbGljYXRpb24gYWxyZWFkeSBleGlzdHMuJztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGVycm9yLnN0YXR1c0NvZGUgPT09IDQwMykge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IucGFzc3dvcmQgPSAnV3JvbmcgcGFzc3dvcmQgcHJvdmlkZWQuJztcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSAnQXBwIHdpdGggdGhlIG5hbWUgJyArICRzY29wZS5hcHAubmFtZSArICcgY2Fubm90IGJlIGluc3RhbGxlZC4nO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlcGxhY2UoJyMvYXBwLycgKyBhcHBJZCArICcvZGV0YWlscycpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgIH07XG5cbiAgICAvLyBoYWNrIGZvciBhdXRvZm9jdXMgd2l0aCBhbmd1bGFyXG4gICAgJHNjb3BlLiRvbignJHZpZXdDb250ZW50TG9hZGVkJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7ICQoJ2lucHV0W2F1dG9mb2N1c106dmlzaWJsZTpmaXJzdCcpLmZvY3VzKCk7IH0sIDEwMDApO1xuICAgIH0pO1xufTtcbiIsIi8qIGV4cG9ydGVkIERhc2hib2FyZENvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgRGFzaGJvYXJkQ29udHJvbGxlciA9IGZ1bmN0aW9uICgpIHtcblxufTtcbiIsIi8qIGV4cG9ydGVkIEdyYXBoc0NvbnRyb2xsZXIgKi9cbi8qIGdsb2JhbCAkOnRydWUgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgR3JhcGhzQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsIENsaWVudCkge1xuICAgICRzY29wZS5hY3RpdmVUYWIgPSAnZGF5JztcblxuICAgIHZhciBjcHVVc2FnZVRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKCcgK1xuICAgICdzY2FsZShkaXZpZGVTZXJpZXMoJyArXG4gICAgICAgICdzdW1TZXJpZXMoY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1zeXN0ZW0sY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1uaWNlLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtdXNlciksJyArXG4gICAgICAgICdzdW1TZXJpZXMoY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1pZGxlLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtc3lzdGVtLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtbmljZSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXVzZXIsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS13YWl0KSksIDEwMCksIDApJztcblxuICAgIHZhciBuZXR3b3JrVXNhZ2VUeFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5pbnRlcmZhY2UtZXRoMC5pZl9vY3RldHMudHgsIDApJztcbiAgICB2YXIgbmV0d29ya1VzYWdlUnhUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuaW50ZXJmYWNlLWV0aDAuaWZfb2N0ZXRzLnJ4LCAwKSc7XG5cbiAgICB2YXIgZGlza1VzYWdlQXBwc1VzZWRUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuZGYtbG9vcDAuZGZfY29tcGxleC11c2VkLCAwKSc7XG4gICAgdmFyIGRpc2tVc2FnZURhdGFVc2VkVGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoY29sbGVjdGQubG9jYWxob3N0LmRmLWxvb3AxLmRmX2NvbXBsZXgtdXNlZCwgMCknO1xuXG4gICAgZnVuY3Rpb24gcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgY3B1RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRDcHUgPSBbIF07XG5cbiAgICAgICAgaWYgKGNwdURhdGEgJiYgY3B1RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZENwdSA9IGNwdURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBjcHVHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdDcHVDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMTAwLFxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZENwdSxcbiAgICAgICAgICAgICAgICBuYW1lOiAnY3B1J1xuICAgICAgICAgICAgfV1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGNwdVhBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBjcHVHcmFwaCB9KTtcbiAgICAgICAgdmFyIGNwdVlBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogY3B1R3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnQ3B1WUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGNwdUhvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeSkudG9GaXhlZCgyKSArICclPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNwdUdyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbmRlck5ldHdvcmsoYWN0aXZlVGFiLCB0eERhdGEsIHJ4RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRUeCA9IFsgXSwgdHJhbnNmb3JtZWRSeCA9IFsgXTtcblxuICAgICAgICBpZiAodHhEYXRhICYmIHR4RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZFR4ID0gdHhEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcbiAgICAgICAgaWYgKHJ4RGF0YSAmJiByeERhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRSeCA9IHJ4RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIG5ldHdvcmtHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdOZXR3b3JrQ2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBzZXJpZXM6IFsge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZFR4LFxuICAgICAgICAgICAgICAgIG5hbWU6ICd0eCdcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBjb2xvcjogJ2dyZWVuJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZFJ4LFxuICAgICAgICAgICAgICAgIG5hbWU6ICdyeCdcbiAgICAgICAgICAgIH0gXVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIG5ldHdvcmtYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogbmV0d29ya0dyYXBoIH0pO1xuICAgICAgICB2YXIgbmV0d29ya1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogbmV0d29ya0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ05ldHdvcmtZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbmV0d29ya0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBuZXR3b3JrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvMTAyNCkudG9GaXhlZCgyKSArICdLQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBuZXR3b3JrR3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyRGlzayhhY3RpdmVUYWIsIGFwcHNVc2VkRGF0YSwgZGF0YVVzZWREYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZEFwcHNVc2VkID0gWyBdLCB0cmFuc2Zvcm1lZERhdGFVc2VkID0gWyBdO1xuXG4gICAgICAgIGlmIChhcHBzVXNlZERhdGEgJiYgYXBwc1VzZWREYXRhLmRhdGFwb2ludHMpIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybWVkQXBwc1VzZWQgPSBhcHBzVXNlZERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9OyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhVXNlZERhdGEgJiYgZGF0YVVzZWREYXRhLmRhdGFwb2ludHMpIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybWVkRGF0YVVzZWQgPSBkYXRhVXNlZERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9OyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkaXNrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnRGlza0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAzMCAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMzBnYlxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZEFwcHNVc2VkLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBzJ1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JlZW4nLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkRGF0YVVzZWQsXG4gICAgICAgICAgICAgICAgbmFtZTogJ2RhdGEnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIGRpc2tYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogZGlza0dyYXBoIH0pO1xuICAgICAgICB2YXIgZGlza1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0Rpc2tZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvKDEwMjQgKiAxMDI0ICogMTAyNCkpLnRvRml4ZWQoMikgKyAnR0I8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tMZWdlbmQgPSBuZXcgUmlja3NoYXcuR3JhcGguTGVnZW5kKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza0xlZ2VuZCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRpc2tHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAkc2NvcGUudXBkYXRlR3JhcGhzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYWN0aXZlVGFiID0gJHNjb3BlLmFjdGl2ZVRhYjtcbiAgICAgICB2YXIgZnJvbSA9ICctMjRob3Vycyc7XG4gICAgICAgIHN3aXRjaCAoYWN0aXZlVGFiKSB7XG4gICAgICAgIGNhc2UgJ2RheSc6IGZyb20gPSAnLTI0aG91cnMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnbW9udGgnOiBmcm9tID0gJy0xbW9udGgnOyBicmVhaztcbiAgICAgICAgY2FzZSAneWVhcic6IGZyb20gPSAnLTF5ZWFyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUubG9nKCdpbnRlcm5hbCBlcnJyb3InKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5ncmFwaHMoWyBjcHVVc2FnZVRhcmdldCwgbmV0d29ya1VzYWdlVHhUYXJnZXQsIG5ldHdvcmtVc2FnZVJ4VGFyZ2V0LCBkaXNrVXNhZ2VBcHBzVXNlZFRhcmdldCwgZGlza1VzYWdlRGF0YVVzZWRUYXJnZXQgXSwgZnJvbSwgZnVuY3Rpb24gKGVycm9yLCBkYXRhKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmxvZyhlcnJvcik7XG5cbiAgICAgICAgICAgIHJlbmRlckNwdShhY3RpdmVUYWIsIGRhdGFbMF0pO1xuXG4gICAgICAgICAgICByZW5kZXJOZXR3b3JrKGFjdGl2ZVRhYiwgZGF0YVsxXSwgZGF0YVsyXSk7XG5cbiAgICAgICAgICAgIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkYXRhWzNdLCBkYXRhWzRdKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KCRzY29wZS51cGRhdGVHcmFwaHMpO1xufTtcblxuIiwiLyogZXhwb3J0ZWQgU2VjdXJpdHlDb250cm9sbGVyICovXG4vKiBnbG9iYWwgJCAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBTZWN1cml0eUNvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuYWN0aXZlQ2xpZW50cyA9IFtdO1xuICAgICRzY29wZS50b2tlbkluVXNlID0gbnVsbDtcblxuICAgICRzY29wZS5yZW1vdmVBY2Nlc3NUb2tlbnMgPSBmdW5jdGlvbiAoY2xpZW50LCBldmVudCkge1xuICAgICAgICBjbGllbnQuX2J1c3kgPSB0cnVlO1xuXG4gICAgICAgIENsaWVudC5kZWxUb2tlbnNCeUNsaWVudElkKGNsaWVudC5pZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICQoZXZlbnQudGFyZ2V0KS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICAgICAgICAgIGNsaWVudC5fYnVzeSA9IGZhbHNlO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUudG9rZW5JblVzZSA9IENsaWVudC5fdG9rZW47XG5cbiAgICAgICAgQ2xpZW50LmdldE9BdXRoQ2xpZW50cyhmdW5jdGlvbiAoZXJyb3IsIGFjdGl2ZUNsaWVudHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAkc2NvcGUuYWN0aXZlQ2xpZW50cyA9IGFjdGl2ZUNsaWVudHM7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufTtcbiIsIi8qIGV4cG9ydGVkIFNldHRpbmdzQ29udHJvbGxlciAqL1xuLyogZ2xvYmFsICQ6dHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cblxudmFyIFNldHRpbmdzQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsIENsaWVudCkge1xuICAgICRzY29wZS51c2VyID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLmNvbmZpZyA9IENsaWVudC5nZXRDb25maWcoKTtcbiAgICAkc2NvcGUubmFrZWREb21haW5BcHAgPSBudWxsO1xuICAgICRzY29wZS5kcml2ZXMgPSBbXTtcbiAgICAkc2NvcGUuY2VydGlmaWNhdGVGaWxlID0gbnVsbDtcbiAgICAkc2NvcGUuY2VydGlmaWNhdGVGaWxlTmFtZSA9ICcnO1xuICAgICRzY29wZS5rZXlGaWxlID0gbnVsbDtcbiAgICAkc2NvcGUua2V5RmlsZU5hbWUgPSAnJztcblxuICAgICRzY29wZS5zZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFwcGlkID0gJHNjb3BlLm5ha2VkRG9tYWluQXBwID8gJHNjb3BlLm5ha2VkRG9tYWluQXBwLmlkIDogJ2FkbWluJztcblxuICAgICAgICBDbGllbnQuc2V0TmFrZWREb21haW4oYXBwaWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignRXJyb3Igc2V0dGluZyBuYWtlZCBkb21haW4nLCBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2hhbmdlUGFzc3dvcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvdXNlcnBhc3N3b3JkJztcbiAgICB9O1xuXG4gICAgJHNjb3BlLmJhY2t1cCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJCgnI2JhY2t1cFByb2dyZXNzTW9kYWwnKS5tb2RhbCgnc2hvdycpO1xuICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IGZhbHNlO1xuXG4gICAgICAgIENsaWVudC5iYWNrdXAoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAvLyBub3cgc3RhcnQgcXVlcnlcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNoZWNrSWZEb25lKCkge1xuICAgICAgICAgICAgICAgIENsaWVudC52ZXJzaW9uKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgMTAwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgJCgnI2JhY2t1cFByb2dyZXNzTW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCA1MDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5yZWJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNyZWJvb3RNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG4gICAgICAgICQoJyNyZWJvb3RQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcbiAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBDbGllbnQucmVib290KGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gbm93IHN0YXJ0IHF1ZXJ5XG4gICAgICAgICAgICBmdW5jdGlvbiBjaGVja0lmRG9uZSgpIHtcbiAgICAgICAgICAgICAgICBDbGllbnQudmVyc2lvbihmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDEwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICQoJyNyZWJvb3RQcm9ncmVzc01vZGFsJykubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh3aW5kb3cubG9jYXRpb24ucmVsb2FkLmJpbmQod2luZG93LmxvY2F0aW9uLCB0cnVlKSwgMTAwMCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCA1MDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS51cGRhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyN1cGRhdGVNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG4gICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcbiAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBDbGllbnQudXBkYXRlKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gdGhlIG1vZGFsIGRpYWxvZyBpcyBuZXZlciBoaWRkZW4uIHRoZSBtYWluIHBhZ2Ugd2lsbCByZWxvYWQgaXRzZWxmIHdoZW4gdXBkYXRlIGhhcyBmaW5pc2hlZFxuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkQ2VydGlmaWNhdGUnKS5vbmNoYW5nZSA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAkc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUgPSBldmVudC50YXJnZXQuZmlsZXNbMF07XG4gICAgICAgICAgICAkc2NvcGUuY2VydGlmaWNhdGVGaWxlTmFtZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXS5uYW1lO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkS2V5Jykub25jaGFuZ2UgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgJHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkc2NvcGUua2V5RmlsZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXTtcbiAgICAgICAgICAgICRzY29wZS5rZXlGaWxlTmFtZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXS5uYW1lO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnNldENlcnRpZmljYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zb2xlLmxvZygnV2lsbCBzZXQgdGhlIGNlcnRpZmljYXRlJyk7XG5cbiAgICAgICAgaWYgKCEkc2NvcGUuY2VydGlmaWNhdGVGaWxlKSByZXR1cm4gY29uc29sZS5sb2coJ0NlcnRpZmljYXRlIG5vdCBzZXQnKTtcbiAgICAgICAgaWYgKCEkc2NvcGUua2V5RmlsZSkgcmV0dXJuIGNvbnNvbGUubG9nKCdLZXkgbm90IHNldCcpO1xuXG4gICAgICAgIENsaWVudC5zZXRDZXJ0aWZpY2F0ZSgkc2NvcGUuY2VydGlmaWNhdGVGaWxlLCAkc2NvcGUua2V5RmlsZSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmxvZyhlcnJvcik7XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQuYmluZCh3aW5kb3cubG9jYXRpb24sIHRydWUpLCAzMDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vbkNvbmZpZyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS50b2tlbkluVXNlID0gQ2xpZW50Ll90b2tlbjtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBhcHAgbGlzdCcpO1xuICAgICAgICAgICAgJHNjb3BlLmFwcHMgPSBhcHBzO1xuXG4gICAgICAgICAgICBDbGllbnQuZ2V0TmFrZWREb21haW4oZnVuY3Rpb24gKGVycm9yLCBhcHBpZCkge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLm5ha2VkRG9tYWluQXBwID0gbnVsbDtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8ICRzY29wZS5hcHBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICgkc2NvcGUuYXBwc1tpXS5pZCA9PT0gYXBwaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5uYWtlZERvbWFpbkFwcCA9ICRzY29wZS5hcHBzW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgQ2xpZW50LnN0YXRzKGZ1bmN0aW9uIChlcnJvciwgc3RhdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgICRzY29wZS5kcml2ZXMgPSBzdGF0cy5kcml2ZXM7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuIiwiLyogZXhwb3J0ZWQgVXNlckNyZWF0ZUNvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBVc2VyQ3JlYXRlQ29udHJvbGxlciAoJHNjb3BlLCAkcm91dGVQYXJhbXMsIENsaWVudCkge1xuICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuXG4gICAgJHNjb3BlLnVzZXJuYW1lID0gJyc7XG4gICAgJHNjb3BlLmVtYWlsID0gJyc7XG4gICAgJHNjb3BlLmFscmVhZHlUYWtlbiA9ICcnO1xuXG4gICAgJHNjb3BlLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmFscmVhZHlUYWtlbiA9ICcnO1xuXG4gICAgICAgICRzY29wZS5kaXNhYmxlZCA9IHRydWU7XG5cbiAgICAgICAgQ2xpZW50LmNyZWF0ZVVzZXIoJHNjb3BlLnVzZXJuYW1lLCAkc2NvcGUuZW1haWwsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnN0YXR1c0NvZGUgPT09IDQwOSkge1xuICAgICAgICAgICAgICAgICRzY29wZS5hbHJlYWR5VGFrZW4gPSAkc2NvcGUudXNlcm5hbWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VzZXJuYW1lIGFscmVhZHkgdGFrZW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGNyZWF0ZSB1c2VyLicsIGVycm9yKTtcblxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy91c2VybGlzdCc7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcbn1cbiIsIi8qIGV4cG9ydGVkIFVzZXJMaXN0Q29udHJvbGxlciAqL1xuLyogZ2xvYmFsICQ6dHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIFVzZXJMaXN0Q29udHJvbGxlciAoJHNjb3BlLCBDbGllbnQpIHtcbiAgICAkc2NvcGUucmVhZHkgPSBmYWxzZTtcbiAgICAkc2NvcGUudXNlcnMgPSBbXTtcbiAgICAkc2NvcGUudXNlckluZm8gPSBDbGllbnQuZ2V0VXNlckluZm8oKTtcbiAgICAkc2NvcGUudXNlckRlbGV0ZUZvcm0gPSB7XG4gICAgICAgIHVzZXJuYW1lOiAnJyxcbiAgICAgICAgcGFzc3dvcmQ6ICcnXG4gICAgfTtcblxuICAgICRzY29wZS5pc01lID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIHVzZXIudXNlcm5hbWUgPT09IENsaWVudC5nZXRVc2VySW5mbygpLnVzZXJuYW1lO1xuICAgIH07XG5cbiAgICAkc2NvcGUuaXNBZG1pbiA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiAhIXVzZXIuYWRtaW47XG4gICAgfTtcblxuICAgICRzY29wZS50b2dnbGVBZG1pbiA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIENsaWVudC5zZXRBZG1pbih1c2VyLnVzZXJuYW1lLCAhdXNlci5hZG1pbiwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgdXNlci5hZG1pbiA9ICF1c2VyLmFkbWluO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmRlbGV0ZVVzZXIgPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAvLyBUT0RPIGFkZCBidXN5IGluZGljYXRvciBhbmQgYmxvY2sgZm9ybVxuICAgICAgICBpZiAoJHNjb3BlLnVzZXJEZWxldGVGb3JtLnVzZXJuYW1lICE9PSB1c2VyLnVzZXJuYW1lKSByZXR1cm4gY29uc29sZS5lcnJvcignVXNlcm5hbWUgZG9lcyBub3QgbWF0Y2gnKTtcblxuICAgICAgICBDbGllbnQucmVtb3ZlVXNlcih1c2VyLnVzZXJuYW1lLCAkc2NvcGUudXNlckRlbGV0ZUZvcm0ucGFzc3dvcmQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnN0YXR1c0NvZGUgPT09IDQwMSkgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1dyb25nIHBhc3N3b3JkJyk7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gZGVsZXRlIHVzZXIuJywgZXJyb3IpO1xuXG4gICAgICAgICAgICAkKCcjdXNlckRlbGV0ZU1vZGFsLScgKyB1c2VyLnVzZXJuYW1lKS5tb2RhbCgnaGlkZScpO1xuXG4gICAgICAgICAgICByZWZyZXNoKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiByZWZyZXNoKCkge1xuICAgICAgICBDbGllbnQubGlzdFVzZXJzKGZ1bmN0aW9uIChlcnJvciwgcmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gZ2V0IHVzZXIgbGlzdGluZy4nLCBlcnJvcik7XG5cbiAgICAgICAgICAgICRzY29wZS51c2VycyA9IHJlc3VsdC51c2VycztcbiAgICAgICAgICAgICRzY29wZS5yZWFkeSA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgICRzY29wZS5hZGRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjL3VzZXJjcmVhdGUnO1xuICAgIH07XG5cbiAgICByZWZyZXNoKCk7XG59XG4iLCIvKiBleHBvcnRlZCBVc2VyUGFzc3dvcmRDb250cm9sbGVyICovXG5cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gVXNlclBhc3N3b3JkQ29udHJvbGxlciAoJHNjb3BlLCAkcm91dGVQYXJhbXMsIENsaWVudCkge1xuICAgICRzY29wZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAkc2NvcGUuY3VycmVudFBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLm5ld1Bhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLnJlcGVhdFBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcyA9IHt9O1xuXG4gICAgJHNjb3BlLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5jdXJyZW50UGFzc3dvcmQgPSAnJztcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5uZXdQYXNzd29yZCA9ICcnO1xuICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLnJlcGVhdFBhc3N3b3JkID0gJyc7XG5cbiAgICAgICAgaWYgKCRzY29wZS5uZXdQYXNzd29yZCAhPT0gJHNjb3BlLnJlcGVhdFBhc3N3b3JkKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRSZXBlYXRQYXNzd29yZCcpLmZvY3VzKCk7XG4gICAgICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLnJlcGVhdFBhc3N3b3JkID0gJ2hhcy1lcnJvcic7XG4gICAgICAgICAgICAkc2NvcGUucmVwZWF0UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgICRzY29wZS5hY3RpdmUgPSB0cnVlO1xuICAgICAgICBDbGllbnQuY2hhbmdlUGFzc3dvcmQoJHNjb3BlLmN1cnJlbnRQYXNzd29yZCwgJHNjb3BlLm5ld1Bhc3N3b3JkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRDdXJyZW50UGFzc3dvcmQnKS5mb2N1cygpO1xuICAgICAgICAgICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MuY3VycmVudFBhc3N3b3JkID0gJ2hhcy1lcnJvcic7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmN1cnJlbnRQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgICRzY29wZS5uZXdQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgICRzY29wZS5yZXBlYXRQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBjaGFuZ2UgcGFzc3dvcmQuJywgZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0Q3VycmVudFBhc3N3b3JkJykuZm9jdXMoKTtcbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==