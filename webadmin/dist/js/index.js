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
            appServerUrl: null,
            fqdn: null,
            ip: null,
            revision: null,
            update: null,
            isDev: false
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
        // In order to keep the angular bindings alive, set each property individually
        this._config.appServerUrl = config.appServerUrl;
        this._config.version = config.version;
        this._config.fqdn = config.fqdn;
        this._config.ip = config.ip;
        this._config.revision = config.revision;
        this._config.update = config.update;
        this._config.isDev = config.isDev;

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
        $http.post('/api/v1/settings/naked_domain', { appid: appid || '' }).success(function (data, status) {
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

    Client.prototype.createUser = function (username, password, email, callback) {
        var data = {
            username: username,
            password: password,
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
        if (Client.getConfig().appServerUrl === null) return callback(new AppStoreError(500, 'Not yet initialized'));

        var that = this;

        $http.get(Client.getConfig().appServerUrl + '/api/v1/appstore/apps').success(function (data, status) {
            if (status !== 200) return callback(new AppStoreError(status, data));

            // TODO remove old apps
            data.apps.forEach(function (app) {
                if (that._appsCache[app.id]) return;

                // prefix the appstore server url to icons
                if (app.icon) app.icon = Client.getConfig().appServerUrl + app.icon;

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
        if (Client.getConfig().appServerUrl === null) return callback(new AppStoreError(500, 'Not yet initialized'));

        var manifestUrl = Client.getConfig().appServerUrl + '/api/v1/appstore/apps/' + appId + '/manifest';
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
};

/* exported AppConfigureController */

'use strict';

var AppConfigureController = function ($scope, $routeParams, Client) {
    $scope.app = null;
    $scope.password = '';
    $scope.location = '';
    $scope.accessRestriction = '';
    $scope.disabled = false;
    $scope.error = { };
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
                    $scope.app.password = '';
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
                    $scope.app.password = '';
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
        $timeout(function () { $('input[autofocus]:visible:first').focus();
        console.log($scope.install_form) }, 1000);
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
        if (!config.appServerUrl) return;
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

    $scope.setNakedDomain = function () {
        var appid = $scope.nakedDomainApp ? $scope.nakedDomainApp.id : null;

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

            // now start query
            function checkIfDone() {
                Client.version(function (error) {
                    if (error) return window.setTimeout(checkIfDone, 1000);

                    $('#updateProgressModal').modal('hide');

                    window.setTimeout(window.location.reload.bind(window.location, true), 1000);
                });
            }

            window.setTimeout(checkIfDone, 5000);
        });
    };

    Client.onConfig(function () {
        $scope.tokenInUse = Client._token;

        Client.getApps(function (error, apps) {
            if (error) console.error('Error loading app list');
            $scope.apps = apps;

            Client.getNakedDomain(function (error, appid) {
                if (error) return console.error(error);

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

    // http://stackoverflow.com/questions/1497481/javascript-password-generator#1497512
    function generatePassword() {
        var length = 8,
            charset = 'abcdefghijklnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            retVal = '';
        for (var i = 0, n = charset.length; i < length; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
        return retVal;
    }

    $scope.submit = function () {
        $scope.alreadyTaken = '';

        $scope.disabled = true;
        var password = generatePassword();

        Client.createUser($scope.username, password, $scope.email, function (error) {
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIiwiY2xpZW50LmpzIiwiYXBwc3RvcmUuanMiLCJtYWluLmpzIiwiYXBwY29uZmlndXJlLmpzIiwiYXBwZGV0YWlscy5qcyIsImFwcGluc3RhbGwuanMiLCJkYXNoYm9hcmQuanMiLCJncmFwaHMuanMiLCJzZWN1cml0eS5qcyIsInNldHRpbmdzLmpzIiwidXNlcmNyZWF0ZS5qcyIsInVzZXJsaXN0LmpzIiwidXNlcnBhc3N3b3JkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN2R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNyY0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDdE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FKM0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FLckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbi8qIGdsb2JhbCBhbmd1bGFyOmZhbHNlICovXG5cbi8vIGNyZWF0ZSBtYWluIGFwcGxpY2F0aW9uIG1vZHVsZVxudmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicsIFsnbmdSb3V0ZScsICduZ0FuaW1hdGUnLCAnYmFzZTY0JywgJ2FuZ3VsYXItbWQ1J10pO1xuXG4vLyBzZXR1cCBhbGwgbWFqb3IgYXBwbGljYXRpb24gcm91dGVzXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkcm91dGVQcm92aWRlcikge1xuICAgICRyb3V0ZVByb3ZpZGVyLndoZW4oJy8nLCB7XG4gICAgICAgIHJlZGlyZWN0VG86ICcvZGFzaGJvYXJkJ1xuICAgIH0pLndoZW4oJy9kYXNoYm9hcmQnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdEYXNoYm9hcmRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9kYXNoYm9hcmQuaHRtbCdcbiAgICB9KS53aGVuKCcvdXNlcmNyZWF0ZScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1VzZXJDcmVhdGVDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy91c2VyY3JlYXRlLmh0bWwnXG4gICAgfSkud2hlbignL3VzZXJwYXNzd29yZCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1VzZXJQYXNzd29yZENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3VzZXJwYXNzd29yZC5odG1sJ1xuICAgIH0pLndoZW4oJy91c2VybGlzdCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1VzZXJMaXN0Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvdXNlcmxpc3QuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwc3RvcmUnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdBcHBTdG9yZUNvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcHN0b3JlLmh0bWwnXG4gICAgfSkud2hlbignL2FwcC86YXBwU3RvcmVJZC9pbnN0YWxsJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwSW5zdGFsbENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcGluc3RhbGwuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwLzphcHBJZC9jb25maWd1cmUnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdBcHBDb25maWd1cmVDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBjb25maWd1cmUuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwLzphcHBJZC9kZXRhaWxzJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwRGV0YWlsc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcGRldGFpbHMuaHRtbCdcbiAgICB9KS53aGVuKCcvc2V0dGluZ3MnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdTZXR0aW5nc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3NldHRpbmdzLmh0bWwnXG4gICAgfSkud2hlbignL2dyYXBocycsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0dyYXBoc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2dyYXBocy5odG1sJ1xuICAgIH0pLndoZW4oJy9zZWN1cml0eScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1NlY3VyaXR5Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3Mvc2VjdXJpdHkuaHRtbCdcbiAgICB9KS5vdGhlcndpc2UoeyByZWRpcmVjdFRvOiAnLyd9KTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdpbnN0YWxsYXRpb25BY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZXJyb3InKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2luc3RhbGxlZCcpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdpbnN0YWxsYXRpb25TdGF0ZUxhYmVsJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Vycm9yJykgcmV0dXJuICdFcnJvcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3N1YmRvbWFpbl9lcnJvcicpIHJldHVybiAnRXJyb3InO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdpbnN0YWxsZWQnKSByZXR1cm4gJ0luc3RhbGxlZCc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Rvd25sb2FkaW5nX2ltYWdlJykgcmV0dXJuICdEb3dubG9hZGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3BlbmRpbmdfaW5zdGFsbCcpIHJldHVybiAnSW5zdGFsbGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3BlbmRpbmdfdW5pbnN0YWxsJykgcmV0dXJuICdVbmluc3RhbGxpbmcnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdjcmVhdGluZ19jb250YWluZXInKSByZXR1cm4gJ0NvbnRhaW5lcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Rvd25sb2FkaW5nX21hbmlmZXN0JykgcmV0dXJuICdNYW5pZmVzdCc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2NyZWF0aW5nX3ZvbHVtZScpIHJldHVybiAnVm9sdW1lJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncmVnaXN0ZXJpbmdfc3ViZG9tYWluJykgcmV0dXJuICdTdWJkb21haW4nO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdhbGxvY2F0ZWRfb2F1dGhfY3JlZGVudGlhbHMnKSByZXR1cm4gJ09BdXRoJztcblxuICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgfTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdhY2Nlc3NSZXN0cmljdGlvbkxhYmVsJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJycpIHJldHVybiAncHVibGljJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncm9sZVVzZXInKSByZXR1cm4gJ3ByaXZhdGUnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyb2xlQWRtaW4nKSByZXR1cm4gJ3ByaXZhdGUgKEFkbWlucyBvbmx5KSc7XG5cbiAgICAgICAgcmV0dXJuIGlucHV0O1xuICAgIH07XG59KTtcblxuLy8gY3VzdG9tIGRpcmVjdGl2ZSBmb3IgZHluYW1pYyBuYW1lcyBpbiBmb3Jtc1xuLy8gU2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjM2MTY1NzgvaXNzdWUtcmVnaXN0ZXJpbmctZm9ybS1jb250cm9sLXdpdGgtaW50ZXJwb2xhdGVkLW5hbWUjYW5zd2VyLTIzNjE3NDAxXG5hcHAuZGlyZWN0aXZlKCdsYXRlck5hbWUnLCBmdW5jdGlvbiAoKSB7ICAgICAgICAgICAgICAgICAgIC8vICgyKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICAgIHJlcXVpcmU6IFsnP25nTW9kZWwnLCAnXj9mb3JtJ10sICAgICAgICAgICAgICAgICAgIC8vICgzKVxuICAgICAgICBsaW5rOiBmdW5jdGlvbiBwb3N0TGluayhzY29wZSwgZWxlbSwgYXR0cnMsIGN0cmxzKSB7XG4gICAgICAgICAgICBhdHRycy4kc2V0KCduYW1lJywgYXR0cnMubGF0ZXJOYW1lKTtcblxuICAgICAgICAgICAgdmFyIG1vZGVsQ3RybCA9IGN0cmxzWzBdOyAgICAgICAgICAgICAgICAgICAgICAvLyAoMylcbiAgICAgICAgICAgIHZhciBmb3JtQ3RybCAgPSBjdHJsc1sxXTsgICAgICAgICAgICAgICAgICAgICAgLy8gKDMpXG4gICAgICAgICAgICBpZiAobW9kZWxDdHJsICYmIGZvcm1DdHJsKSB7XG4gICAgICAgICAgICAgICAgbW9kZWxDdHJsLiRuYW1lID0gYXR0cnMubmFtZTsgICAgICAgICAgICAgIC8vICg0KVxuICAgICAgICAgICAgICAgIGZvcm1DdHJsLiRhZGRDb250cm9sKG1vZGVsQ3RybCk7ICAgICAgICAgICAvLyAoMilcbiAgICAgICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBmb3JtQ3RybC4kcmVtb3ZlQ29udHJvbChtb2RlbEN0cmwpOyAgICAvLyAoNSlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59KTsiLCIndXNlIHN0cmljdCc7XG5cbi8qIGdsb2JhbCBhbmd1bGFyICovXG4vKiBnbG9iYWwgRXZlbnRTb3VyY2UgKi9cblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuc2VydmljZSgnQ2xpZW50JywgZnVuY3Rpb24gKCRodHRwLCBtZDUpIHtcbiAgICB2YXIgY2xpZW50ID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIENsaWVudEVycm9yKHN0YXR1c0NvZGUsIG1lc3NhZ2UpIHtcbiAgICAgICAgRXJyb3IuY2FsbCh0aGlzKTtcbiAgICAgICAgdGhpcy5uYW1lID0gdGhpcy5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgICAgICB0aGlzLnN0YXR1c0NvZGUgPSBzdGF0dXNDb2RlO1xuICAgICAgICBpZiAodHlwZW9mIG1lc3NhZ2UgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2UgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09IDQwMSkgcmV0dXJuIGNsaWVudC5sb2dvdXQoKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBDbGllbnQoKSB7XG4gICAgICAgIHRoaXMuX3JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyID0gW107XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIgPSBbXTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8gPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogbnVsbCxcbiAgICAgICAgICAgIGVtYWlsOiBudWxsLFxuICAgICAgICAgICAgYWRtaW46IGZhbHNlXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2xpZW50SWQgPSAnY2lkLXdlYmFkbWluJztcbiAgICAgICAgdGhpcy5fY2xpZW50U2VjcmV0ID0gJ3VudXNlZCc7XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IHtcbiAgICAgICAgICAgIGFwcFNlcnZlclVybDogbnVsbCxcbiAgICAgICAgICAgIGZxZG46IG51bGwsXG4gICAgICAgICAgICBpcDogbnVsbCxcbiAgICAgICAgICAgIHJldmlzaW9uOiBudWxsLFxuICAgICAgICAgICAgdXBkYXRlOiBudWxsLFxuICAgICAgICAgICAgaXNEZXY6IGZhbHNlXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuX2luc3RhbGxlZEFwcHMgPSBbXTtcblxuICAgICAgICB0aGlzLnNldFRva2VuKGxvY2FsU3RvcmFnZS50b2tlbik7XG4gICAgfVxuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRSZWFkeSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlYWR5KSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fcmVhZHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9yZWFkeUxpc3RlbmVyLmZvckVhY2goZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5vblJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZWFkeSkgY2FsbGJhY2soKTtcbiAgICAgICAgdGhpcy5fcmVhZHlMaXN0ZW5lci5wdXNoKGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5vbkNvbmZpZyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9jb25maWdMaXN0ZW5lci5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgY2FsbGJhY2sodGhpcy5fY29uZmlnKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRVc2VySW5mbyA9IGZ1bmN0aW9uICh1c2VySW5mbykge1xuICAgICAgICAvLyBJbiBvcmRlciB0byBrZWVwIHRoZSBhbmd1bGFyIGJpbmRpbmdzIGFsaXZlLCBzZXQgZWFjaCBwcm9wZXJ0eSBpbmRpdmlkdWFsbHlcbiAgICAgICAgdGhpcy5fdXNlckluZm8udXNlcm5hbWUgPSB1c2VySW5mby51c2VybmFtZTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8uZW1haWwgPSB1c2VySW5mby5lbWFpbDtcbiAgICAgICAgdGhpcy5fdXNlckluZm8uYWRtaW4gPSAhIXVzZXJJbmZvLmFkbWluO1xuICAgICAgICB0aGlzLl91c2VySW5mby5ncmF2YXRhciA9ICdodHRwczovL3d3dy5ncmF2YXRhci5jb20vYXZhdGFyLycgKyBtZDUuY3JlYXRlSGFzaCh1c2VySW5mby5lbWFpbC50b0xvd2VyQ2FzZSgpKSArICcuanBnP3M9MjQmZD1tbSc7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0Q29uZmlnID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICAvLyBJbiBvcmRlciB0byBrZWVwIHRoZSBhbmd1bGFyIGJpbmRpbmdzIGFsaXZlLCBzZXQgZWFjaCBwcm9wZXJ0eSBpbmRpdmlkdWFsbHlcbiAgICAgICAgdGhpcy5fY29uZmlnLmFwcFNlcnZlclVybCA9IGNvbmZpZy5hcHBTZXJ2ZXJVcmw7XG4gICAgICAgIHRoaXMuX2NvbmZpZy52ZXJzaW9uID0gY29uZmlnLnZlcnNpb247XG4gICAgICAgIHRoaXMuX2NvbmZpZy5mcWRuID0gY29uZmlnLmZxZG47XG4gICAgICAgIHRoaXMuX2NvbmZpZy5pcCA9IGNvbmZpZy5pcDtcbiAgICAgICAgdGhpcy5fY29uZmlnLnJldmlzaW9uID0gY29uZmlnLnJldmlzaW9uO1xuICAgICAgICB0aGlzLl9jb25maWcudXBkYXRlID0gY29uZmlnLnVwZGF0ZTtcbiAgICAgICAgdGhpcy5fY29uZmlnLmlzRGV2ID0gY29uZmlnLmlzRGV2O1xuXG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICB0aGlzLl9jb25maWdMaXN0ZW5lci5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sodGhhdC5fY29uZmlnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0SW5zdGFsbGVkQXBwcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luc3RhbGxlZEFwcHM7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0VXNlckluZm8gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl91c2VySW5mbztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRDb25maWcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb25maWc7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0VG9rZW4gPSBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgICAgJGh0dHAuZGVmYXVsdHMuaGVhZGVycy5jb21tb24uQXV0aG9yaXphdGlvbiA9ICdCZWFyZXIgJyArIHRva2VuO1xuICAgICAgICBpZiAoIXRva2VuKSBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgndG9rZW4nKTtcbiAgICAgICAgZWxzZSBsb2NhbFN0b3JhZ2UudG9rZW4gPSB0b2tlbjtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbjtcbiAgICB9O1xuXG4gICAgLypcbiAgICAgKiBSZXN0IEFQSSB3cmFwcGVyc1xuICAgICAqL1xuICAgIENsaWVudC5wcm90b3R5cGUuY29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9jb25maWcnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudXNlckluZm8gPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL3Byb2ZpbGUnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuaW5zdGFsbEFwcCA9IGZ1bmN0aW9uIChpZCwgcGFzc3dvcmQsIHRpdGxlLCBjb25maWcsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcbiAgICAgICAgdmFyIGRhdGEgPSB7IGFwcFN0b3JlSWQ6IGlkLCBwYXNzd29yZDogcGFzc3dvcmQsIGxvY2F0aW9uOiBjb25maWcubG9jYXRpb24sIHBvcnRCaW5kaW5nczogY29uZmlnLnBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246IGNvbmZpZy5hY2Nlc3NSZXN0cmljdGlvbiB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvaW5zdGFsbCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcblxuICAgICAgICAgICAgLy8gcHV0IG5ldyBhcHAgd2l0aCBhbWVuZGVkIHRpdGxlIGluIGNhY2hlXG4gICAgICAgICAgICBkYXRhLm1hbmlmZXN0ID0geyB0aXRsZTogdGl0bGUgfTtcbiAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMucHVzaChkYXRhKTtcblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5pZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jb25maWd1cmVBcHAgPSBmdW5jdGlvbiAoaWQsIHBhc3N3b3JkLCBjb25maWcsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0geyBhcHBJZDogaWQsIHBhc3N3b3JkOiBwYXNzd29yZCwgbG9jYXRpb246IGNvbmZpZy5sb2NhdGlvbiwgcG9ydEJpbmRpbmdzOiBjb25maWcucG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogY29uZmlnLmFjY2Vzc1Jlc3RyaWN0aW9uIH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL2NvbmZpZ3VyZScsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS51cGRhdGVBcHAgPSBmdW5jdGlvbiAoaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL3VwZGF0ZScsIHsgfSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnN0YXJ0QXBwID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvc3RhcnQnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc3RvcEFwcCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7IH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL3N0b3AnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudmVyc2lvbiA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vc3RhdHVzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmlzU2VydmVyRmlyc3RUaW1lID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0dXMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsICFkYXRhLmFjdGl2YXRlZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvc2V0dGluZ3MvbmFrZWRfZG9tYWluJylcbiAgICAgICAgLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYXBwaWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0TmFrZWREb21haW4gPSBmdW5jdGlvbiAoYXBwaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvc2V0dGluZ3MvbmFrZWRfZG9tYWluJywgeyBhcHBpZDogYXBwaWQgfHwgJycgfSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2FwcHMnKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFwcHMpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwID0gZnVuY3Rpb24gKGFwcElkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgYXBwRm91bmQgPSBudWxsO1xuICAgICAgICB0aGlzLl9pbnN0YWxsZWRBcHBzLnNvbWUoZnVuY3Rpb24gKGFwcCkge1xuICAgICAgICAgICAgaWYgKGFwcC5pZCA9PT0gYXBwSWQpIHtcbiAgICAgICAgICAgICAgICBhcHBGb3VuZCA9IGFwcDtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoYXBwRm91bmQpIHJldHVybiBjYWxsYmFjayhudWxsLCBhcHBGb3VuZCk7XG4gICAgICAgIGVsc2UgcmV0dXJuIGNhbGxiYWNrKG5ldyBFcnJvcignQXBwIG5vdCBmb3VuZCcpKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBcHAgPSBmdW5jdGlvbiAoYXBwSWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgYXBwSWQgKyAnL3VuaW5zdGFsbCcpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHBMb2dTdHJlYW0gPSBmdW5jdGlvbiAoYXBwSWQpIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IG5ldyBFdmVudFNvdXJjZSgnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvbG9nc3RyZWFtJyk7XG4gICAgICAgIHJldHVybiBzb3VyY2U7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwTG9nVXJsID0gZnVuY3Rpb24gKGFwcElkKSB7XG4gICAgICAgIHJldHVybiAnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvbG9ncz9hY2Nlc3NfdG9rZW49JyArIHRoaXMuX3Rva2VuO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldEFkbWluID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBhZG1pbiwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHBheWxvYWQgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBhZG1pbjogYWRtaW5cbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL3VzZXJzLycgKyB1c2VybmFtZSArICcvYWRtaW4nLCBwYXlsb2FkKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY3JlYXRlQWRtaW4gPSBmdW5jdGlvbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBlbWFpbCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHBheWxvYWQgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICAgICAgICBlbWFpbDogZW1haWxcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9hY3RpdmF0ZScsIHBheWxvYWQpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICB0aGF0LnNldFRva2VuKGRhdGEudG9rZW4pO1xuICAgICAgICAgICAgdGhhdC5zZXRVc2VySW5mbyh7IHVzZXJuYW1lOiB1c2VybmFtZSwgZW1haWw6IGVtYWlsLCBhZG1pbjogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hY3RpdmF0ZWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUubGlzdFVzZXJzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS91c2VycycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdGF0cyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vc3RhdHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0T0F1dGhDbGllbnRzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9vYXV0aC9jbGllbnRzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmNsaWVudHMpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZGVsVG9rZW5zQnlDbGllbnRJZCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZGVsZXRlKCcvYXBpL3YxL29hdXRoL2NsaWVudHMvJyArIGlkICsgJy90b2tlbnMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3VwZGF0ZScpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWJvb3QgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3JlYm9vdCcpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5iYWNrdXAgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9iYWNrdXBzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdyYXBocyA9IGZ1bmN0aW9uICh0YXJnZXRzLCBmcm9tLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgY29uZmlnID0ge1xuICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0OiB0YXJnZXRzLFxuICAgICAgICAgICAgICAgIGZvcm1hdDogJ2pzb24nLFxuICAgICAgICAgICAgICAgIGZyb206IGZyb21cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vZ3JhcGhzJywgY29uZmlnKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNyZWF0ZVVzZXIgPSBmdW5jdGlvbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBlbWFpbCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICAgICAgICBlbWFpbDogZW1haWxcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL3VzZXJzJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlbW92ZVVzZXIgPSBmdW5jdGlvbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwKHsgbWV0aG9kOiAnREVMRVRFJywgdXJsOiAnL2FwaS92MS91c2Vycy8nICsgdXNlcm5hbWUsIGRhdGE6IGRhdGEsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9fSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY2hhbmdlUGFzc3dvcmQgPSBmdW5jdGlvbiAoY3VycmVudFBhc3N3b3JkLCBuZXdQYXNzd29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICBwYXNzd29yZDogY3VycmVudFBhc3N3b3JkLFxuICAgICAgICAgICAgbmV3UGFzc3dvcmQ6IG5ld1Bhc3N3b3JkXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS91c2Vycy8nICsgdGhpcy5fdXNlckluZm8udXNlcm5hbWUgKyAnL3Bhc3N3b3JkJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlZnJlc2hDb25maWcgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgICAgIGNhbGxiYWNrID0gdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBmdW5jdGlvbiAoKSB7fTtcblxuICAgICAgICB0aGlzLmNvbmZpZyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xuXG4gICAgICAgICAgICB0aGF0LnNldENvbmZpZyhyZXN1bHQpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlZnJlc2hJbnN0YWxsZWRBcHBzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICBjYWxsYmFjayA9IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogZnVuY3Rpb24gKCkge307XG5cbiAgICAgICAgdGhpcy5nZXRBcHBzKGZ1bmN0aW9uIChlcnJvciwgYXBwcykge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xuXG4gICAgICAgICAgICAvLyBpbnNlcnQgb3IgdXBkYXRlIG5ldyBhcHBzXG4gICAgICAgICAgICBhcHBzLmZvckVhY2goZnVuY3Rpb24gKGFwcCkge1xuICAgICAgICAgICAgICAgIHZhciBmb3VuZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGF0Ll9pbnN0YWxsZWRBcHBzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGF0Ll9pbnN0YWxsZWRBcHBzW2ldLmlkID09PSBhcHAuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gaTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICBhbmd1bGFyLmNvcHkoYXBwLCB0aGF0Ll9pbnN0YWxsZWRBcHBzW2ZvdW5kXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5faW5zdGFsbGVkQXBwcy5wdXNoKGFwcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGZpbHRlciBvdXQgb2xkIGVudHJpZXMsIGdvaW5nIGJhY2t3YXJkcyB0byBhbGxvdyBzcGxpY2luZ1xuICAgICAgICAgICAgZm9yKHZhciBpID0gdGhhdC5faW5zdGFsbGVkQXBwcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICAgICAgICAgIGlmICghYXBwcy5zb21lKGZ1bmN0aW9uIChlbGVtKSB7IHJldHVybiAoZWxlbS5pZCA9PT0gdGhhdC5faW5zdGFsbGVkQXBwc1tpXS5pZCk7IH0pKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnNldFRva2VuKG51bGwpO1xuICAgICAgICB0aGlzLl91c2VySW5mbyA9IHt9O1xuXG4gICAgICAgIC8vIGxvZ291dCBmcm9tIE9BdXRoIHNlc3Npb25cbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL2FwaS92MS9zZXNzaW9uL2xvZ291dCc7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZXhjaGFuZ2VDb2RlRm9yVG9rZW4gPSBmdW5jdGlvbiAoYXV0aENvZGUsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgZ3JhbnRfdHlwZTogJ2F1dGhvcml6YXRpb25fY29kZScsXG4gICAgICAgICAgICBjb2RlOiBhdXRoQ29kZSxcbiAgICAgICAgICAgIHJlZGlyZWN0X3VyaTogd2luZG93LmxvY2F0aW9uLm9yaWdpbixcbiAgICAgICAgICAgIGNsaWVudF9pZDogdGhpcy5fY2xpZW50SWQsXG4gICAgICAgICAgICBjbGllbnRfc2VjcmV0OiB0aGlzLl9jbGllbnRTZWNyZXRcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL29hdXRoL3Rva2VuP3Jlc3BvbnNlX3R5cGU9dG9rZW4mY2xpZW50X2lkPScgKyB0aGlzLl9jbGllbnRJZCwgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYWNjZXNzX3Rva2VuKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBjbGllbnQgPSBuZXcgQ2xpZW50KCk7XG4gICAgcmV0dXJuIGNsaWVudDtcbn0pO1xuIiwiLyogZXhwb3J0ZWQgQXBwU3RvcmVDb250cm9sbGVyICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIEFwcFN0b3JlQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsICRsb2NhdGlvbiwgQ2xpZW50LCBBcHBTdG9yZSkge1xuICAgICRzY29wZS5MT0FESU5HID0gMTtcbiAgICAkc2NvcGUuRVJST1IgPSAyO1xuICAgICRzY29wZS5MT0FERUQgPSAzO1xuXG4gICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuTE9BRElORztcbiAgICAkc2NvcGUubG9hZEVycm9yID0gJyc7XG5cbiAgICAkc2NvcGUuYXBwcyA9IFtdO1xuXG4gICAgJHNjb3BlLnJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIENsaWVudC5yZWZyZXNoSW5zdGFsbGVkQXBwcyhmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkVSUk9SO1xuICAgICAgICAgICAgICAgICRzY29wZS5sb2FkRXJyb3IgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgQXBwU3RvcmUuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuRVJST1I7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5sb2FkRXJyb3IgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgYXBwIGluIGFwcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgJHNjb3BlLmFwcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcHBzW2FwcF0uaWQgPT09ICRzY29wZS5hcHBzW2ldLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgJHNjb3BlLmFwcHMucHVzaChhcHBzW2FwcF0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICRzY29wZS5hcHBzLmZvckVhY2goZnVuY3Rpb24gKGFwcCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKENsaWVudC5faW5zdGFsbGVkQXBwcykgYXBwLmluc3RhbGxlZCA9IENsaWVudC5faW5zdGFsbGVkQXBwcy5zb21lKGZ1bmN0aW9uIChhKSB7IHJldHVybiBhLmFwcFN0b3JlSWQgPT09IGFwcC5pZDsgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXBwc1thcHAuaWRdKSAkc2NvcGUuYXBwcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuTE9BREVEO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuaW5zdGFsbEFwcCA9IGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgJGxvY2F0aW9uLnBhdGgoJy9hcHAvJyArIGFwcC5pZCArICcvaW5zdGFsbCcpO1xuICAgIH07XG5cbiAgICAkc2NvcGUub3BlbkFwcCA9IGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBDbGllbnQuX2luc3RhbGxlZEFwcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChDbGllbnQuX2luc3RhbGxlZEFwcHNbaV0uYXBwU3RvcmVJZCA9PT0gYXBwLmlkKSB7XG4gICAgICAgICAgICAgICAgd2luZG93Lm9wZW4oJ2h0dHBzOi8vJyArIENsaWVudC5faW5zdGFsbGVkQXBwc1tpXS5mcWRuKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBDbGllbnQub25Db25maWcoZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICBpZiAoIWNvbmZpZy5hcHBTZXJ2ZXJVcmwpIHJldHVybjtcbiAgICAgICAgJHNjb3BlLnJlZnJlc2goKTtcbiAgICB9KTtcbn07XG4iLCIvKiBleHBvcnRlZCBNYWluQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBNYWluQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZSwgJGludGVydmFsLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUudXNlckluZm8gPSBDbGllbnQuZ2V0VXNlckluZm8oKTtcbiAgICAkc2NvcGUuaW5zdGFsbGVkQXBwcyA9IENsaWVudC5nZXRJbnN0YWxsZWRBcHBzKCk7XG5cbiAgICAkc2NvcGUuaXNBY3RpdmUgPSBmdW5jdGlvbiAodXJsKSB7XG4gICAgICAgIGlmICghJHJvdXRlLmN1cnJlbnQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuICRyb3V0ZS5jdXJyZW50LiQkcm91dGUub3JpZ2luYWxQYXRoLmluZGV4T2YodXJsKSA9PT0gMDtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgJHNjb3BlLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgICAgIENsaWVudC5sb2dvdXQoKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmxvZ2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY2FsbGJhY2tVUkwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgJy9sb2dpbl9jYWxsYmFjay5odG1sJztcbiAgICAgICAgdmFyIHNjb3BlID0gJ3Jvb3QscHJvZmlsZSxhcHBzLHJvbGVBZG1pbic7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9hcGkvdjEvb2F1dGgvZGlhbG9nL2F1dGhvcml6ZT9yZXNwb25zZV90eXBlPWNvZGUmY2xpZW50X2lkPScgKyBDbGllbnQuX2NsaWVudElkICsgJyZyZWRpcmVjdF91cmk9JyArIGNhbGxiYWNrVVJMICsgJyZzY29wZT0nICsgc2NvcGU7XG4gICAgfTtcblxuICAgICRzY29wZS5zZXR1cCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL3NldHVwLmh0bWwnO1xuICAgIH07XG5cbiAgICAkc2NvcGUuZXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9lcnJvci5odG1sJztcbiAgICB9O1xuXG4gICAgQ2xpZW50LmlzU2VydmVyRmlyc3RUaW1lKGZ1bmN0aW9uIChlcnJvciwgaXNGaXJzdFRpbWUpIHtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcbiAgICAgICAgaWYgKGlzRmlyc3RUaW1lKSByZXR1cm4gJHNjb3BlLnNldHVwKCk7XG5cbiAgICAgICAgLy8gd2UgdXNlIHRoZSBjb25maWcgcmVxdWVzdCBhcyBhbiBpbmRpY2F0b3IgaWYgdGhlIHRva2VuIGlzIHN0aWxsIHZhbGlkXG4gICAgICAgIC8vIFRPRE8gd2Ugc2hvdWxkIHByb2JhYmx5IGF0dGFjaCBzdWNoIGEgaGFuZGxlciBmb3IgZWFjaCByZXF1ZXN0LCBhcyB0aGUgdG9rZW4gY2FuIGdldCBpbnZhbGlkXG4gICAgICAgIC8vIGF0IGFueSB0aW1lIVxuICAgICAgICBpZiAobG9jYWxTdG9yYWdlLnRva2VuKSB7XG4gICAgICAgICAgICBDbGllbnQucmVmcmVzaENvbmZpZyhmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAxKSByZXR1cm4gJHNjb3BlLmxvZ2luKCk7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgIENsaWVudC51c2VySW5mbyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiAkc2NvcGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgICAgIENsaWVudC5zZXRVc2VySW5mbyhyZXN1bHQpO1xuXG4gICAgICAgICAgICAgICAgICAgIENsaWVudC5yZWZyZXNoSW5zdGFsbGVkQXBwcyhmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGtpY2sgb2ZmIGluc3RhbGxlZCBhcHBzIGFuZCBjb25maWcgcG9sbGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZnJlc2hBcHBzVGltZXIgPSAkaW50ZXJ2YWwoQ2xpZW50LnJlZnJlc2hJbnN0YWxsZWRBcHBzLmJpbmQoQ2xpZW50KSwgMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVmcmVzaENvbmZpZ1RpbWVyID0gJGludGVydmFsKENsaWVudC5yZWZyZXNoQ29uZmlnLmJpbmQoQ2xpZW50KSwgNTAwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwocmVmcmVzaEFwcHNUaW1lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChyZWZyZXNoQ29uZmlnVGltZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vdyBtYXJrIHRoZSBDbGllbnQgdG8gYmUgcmVhZHlcbiAgICAgICAgICAgICAgICAgICAgICAgIENsaWVudC5zZXRSZWFkeSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBub3cgc2hvdyBVSVxuICAgICAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICRzY29wZS5sb2dpbigpO1xuICAgICAgICB9XG4gICAgfSk7XG59O1xuIiwiLyogZXhwb3J0ZWQgQXBwQ29uZmlndXJlQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBBcHBDb25maWd1cmVDb250cm9sbGVyID0gZnVuY3Rpb24gKCRzY29wZSwgJHJvdXRlUGFyYW1zLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuYXBwID0gbnVsbDtcbiAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAkc2NvcGUubG9jYXRpb24gPSAnJztcbiAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSAnJztcbiAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUuZXJyb3IgPSB7IH07XG4gICAgJHNjb3BlLmRvbWFpbiA9ICcnO1xuICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSB7IH07XG5cbiAgICAkc2NvcGUuY29uZmlndXJlQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9IG51bGw7XG4gICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9IG51bGw7XG5cbiAgICAgICAgdmFyIHBvcnRCaW5kaW5ncyA9IHsgfTtcbiAgICAgICAgZm9yICh2YXIgY29udGFpbmVyUG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICBwb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF0gPSAkc2NvcGUucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdLmhvc3RQb3J0O1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50LmNvbmZpZ3VyZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsICRzY29wZS5wYXNzd29yZCwgeyBsb2NhdGlvbjogJHNjb3BlLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IHBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246ICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gJ1dyb25nIHBhc3N3b3JkIHByb3ZpZGVkLic7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5hcHAucGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9ICdBcHAgd2l0aCB0aGUgbmFtZSAnICsgJHNjb3BlLmFwcC5uYW1lICsgJyBjYW5ub3QgYmUgY29uZmlndXJlZC4nO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlcGxhY2UoJyMvYXBwLycgKyAkcm91dGVQYXJhbXMuYXBwSWQgKyAnL2RldGFpbHMnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZG9tYWluID0gQ2xpZW50LmdldENvbmZpZygpLmZxZG47XG5cbiAgICAgICAgQ2xpZW50LmdldEFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcblxuICAgICAgICAgICAgJHNjb3BlLmFwcCA9IGFwcDtcbiAgICAgICAgICAgICRzY29wZS5sb2NhdGlvbiA9IGFwcC5sb2NhdGlvbjtcbiAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSBhcHAubWFuaWZlc3QudGNwUG9ydHM7XG4gICAgICAgICAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSBhcHAuYWNjZXNzUmVzdHJpY3Rpb247XG4gICAgICAgICAgICBmb3IgKHZhciBjb250YWluZXJQb3J0IGluICRzY29wZS5wb3J0QmluZGluZ3MpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdLmhvc3RQb3J0ID0gYXBwLnBvcnRCaW5kaW5nc1tjb250YWluZXJQb3J0XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRMb2NhdGlvbicpLmZvY3VzKCk7XG59O1xuIiwiLyogZ2xvYmFsICQ6dHJ1ZSAqL1xuLyogZXhwb3J0ZWQgQXBwRGV0YWlsc0NvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgQXBwRGV0YWlsc0NvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCAkaHR0cCwgJHJvdXRlUGFyYW1zLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuYXBwID0ge307XG4gICAgJHNjb3BlLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgJHNjb3BlLnVwZGF0ZUF2YWlsYWJsZSA9IGZhbHNlO1xuICAgICRzY29wZS5hY3RpdmVUYWIgPSAnZGF5JztcblxuICAgICRzY29wZS5zdGFydEFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnN0YXJ0QXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnN0b3BBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIENsaWVudC5zdG9wQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnVwZGF0ZUFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnVwZGF0ZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5kZWxldGVBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNkZWxldGVBcHBNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG5cbiAgICAgICAgQ2xpZW50LnJlbW92ZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvJztcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHJlbmRlckNwdShhY3RpdmVUYWIsIGNwdURhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkQ3B1ID0gWyBdO1xuXG4gICAgICAgIGlmIChjcHVEYXRhICYmIGNwdURhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRDcHUgPSBjcHVEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcblxuICAgICAgICB2YXIgY3B1R3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnQ3B1Q2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDEwMCxcbiAgICAgICAgICAgIHNlcmllczogW3tcbiAgICAgICAgICAgICAgICBjb2xvcjogJ3N0ZWVsYmx1ZScsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRDcHUgfHwgWyBdLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdjcHUnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGNwdUdyYXBoIH0pO1xuICAgICAgICB2YXIgY3B1WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdDcHVZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5KS50b0ZpeGVkKDIpICsgJyU8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY3B1R3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTWVtb3J5KGFjdGl2ZVRhYiwgbWVtb3J5RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRNZW1vcnkgPSBbIF07XG5cbiAgICAgICAgaWYgKG1lbW9yeURhdGEgJiYgbWVtb3J5RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZE1lbW9yeSA9IG1lbW9yeURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBtZW1vcnlHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdNZW1vcnlDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMiAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMmdiXG4gICAgICAgICAgICBzZXJpZXM6IFsge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZE1lbW9yeSB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ21lbW9yeSdcbiAgICAgICAgICAgIH0gXVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIG1lbW9yeVhBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBtZW1vcnlHcmFwaCB9KTtcbiAgICAgICAgdmFyIG1lbW9yeVlBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogbWVtb3J5R3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnTWVtb3J5WUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIG1lbW9yeUhvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBtZW1vcnlHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeS8oMTAyNCoxMDI0KSkudG9GaXhlZCgyKSArICdNQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBtZW1vcnlHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGlza0RhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkRGlzayA9IFsgXTtcblxuICAgICAgICBpZiAoZGlza0RhdGEgJiYgZGlza0RhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWREaXNrID0gZGlza0RhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBkaXNrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnRGlza0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAzMCAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMzBnYlxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZERpc2sgfHwgWyBdLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBzJ1xuICAgICAgICAgICAgfV1cbiAgICAgICAgfSApO1xuXG4gICAgICAgIHZhciBkaXNrWEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGRpc2tHcmFwaCB9KTtcbiAgICAgICAgdmFyIGRpc2tZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrWUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LygxMDI0ICogMTAyNCkpLnRvRml4ZWQoMikgKyAnTUI8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tMZWdlbmQgPSBuZXcgUmlja3NoYXcuR3JhcGguTGVnZW5kKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza0xlZ2VuZCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRpc2tHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAkc2NvcGUudXBkYXRlR3JhcGhzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY3B1VXNhZ2VUYXJnZXQgPVxuICAgICAgICAgICAgJ25vbk5lZ2F0aXZlRGVyaXZhdGl2ZSgnICtcbiAgICAgICAgICAgICAgICAnc3VtU2VyaWVzKGNvbGxlY3RkLmxvY2FsaG9zdC50YWJsZS0nICsgJHNjb3BlLmFwcC5pZCArICctY3B1LmdhdWdlLXVzZXIsJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICdjb2xsZWN0ZC5sb2NhbGhvc3QudGFibGUtJyArICRzY29wZS5hcHAuaWQgKyAnLWNwdS5nYXVnZS1zeXN0ZW0pKSc7IC8vIGFzc3VtZXMgMTAwIGppZmZpZXMgcGVyIHNlYyAoVVNFUl9IWilcblxuICAgICAgICB2YXIgbWVtb3J5VXNhZ2VUYXJnZXQgPSAnY29sbGVjdGQubG9jYWxob3N0LnRhYmxlLScgKyAkc2NvcGUuYXBwLmlkICsgJy1tZW1vcnkuZ2F1Z2UtbWF4X3VzYWdlX2luX2J5dGVzJztcblxuICAgICAgICB2YXIgZGlza1VzYWdlVGFyZ2V0ID0gJ2NvbGxlY3RkLmxvY2FsaG9zdC5maWxlY291bnQtJyArICRzY29wZS5hcHAuaWQgKyAnLWFwcGRhdGEuYnl0ZXMnO1xuXG4gICAgICAgIHZhciBhY3RpdmVUYWIgPSAkc2NvcGUuYWN0aXZlVGFiO1xuICAgICAgICB2YXIgZnJvbSA9ICctMjRob3Vycyc7XG4gICAgICAgIHN3aXRjaCAoYWN0aXZlVGFiKSB7XG4gICAgICAgIGNhc2UgJ2RheSc6IGZyb20gPSAnLTI0aG91cnMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnbW9udGgnOiBmcm9tID0gJy0xbW9udGgnOyBicmVhaztcbiAgICAgICAgY2FzZSAneWVhcic6IGZyb20gPSAnLTF5ZWFyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUubG9nKCdpbnRlcm5hbCBlcnJyb3InKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5ncmFwaHMoWyBjcHVVc2FnZVRhcmdldCwgbWVtb3J5VXNhZ2VUYXJnZXQsIGRpc2tVc2FnZVRhcmdldCBdLCBmcm9tLCBmdW5jdGlvbiAoZXJyb3IsIGRhdGEpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUubG9nKGVycm9yKTtcblxuICAgICAgICAgICAgcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgZGF0YVswXSk7XG5cbiAgICAgICAgICAgIHJlbmRlck1lbW9yeShhY3RpdmVUYWIsIGRhdGFbMV0pO1xuXG4gICAgICAgICAgICByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGF0YVsyXSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeShmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgQ2xpZW50LmdldEFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjLyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkc2NvcGUuYXBwID0gYXBwO1xuICAgICAgICAgICAgJHNjb3BlLmFwcExvZ1VybCA9IENsaWVudC5nZXRBcHBMb2dVcmwoYXBwLmlkKTtcblxuICAgICAgICAgICAgaWYgKENsaWVudC5nZXRDb25maWcoKS51cGRhdGUgJiYgQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZS5hcHBzKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnVwZGF0ZUF2YWlsYWJsZSA9IENsaWVudC5nZXRDb25maWcoKS51cGRhdGUuYXBwcy5zb21lKGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4LmFwcElkID09PSAkc2NvcGUuYXBwLmFwcFN0b3JlSWQgJiYgeC52ZXJzaW9uICE9PSAkc2NvcGUuYXBwLnZlcnNpb247XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS51cGRhdGVHcmFwaHMoKTtcblxuICAgICAgICAgICAgJHNjb3BlLmluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuIiwiLyogZXhwb3J0ZWQgQXBwSW5zdGFsbENvbnRyb2xsZXIgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgQXBwSW5zdGFsbENvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGVQYXJhbXMsIENsaWVudCwgQXBwU3RvcmUsICR0aW1lb3V0KSB7XG4gICAgJHNjb3BlLmFwcCA9IG51bGw7XG4gICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLmxvY2F0aW9uID0gJyc7XG4gICAgJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uID0gJyc7XG4gICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgJHNjb3BlLmVycm9yID0geyB9O1xuICAgICRzY29wZS5kb21haW4gPSAnJztcbiAgICAkc2NvcGUucG9ydEJpbmRpbmdzID0geyB9O1xuICAgICRzY29wZS5ob3N0UG9ydE1pbiA9IDEwMjU7XG4gICAgJHNjb3BlLmhvc3RQb3J0TWF4ID0gOTk5OTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmRvbWFpbiA9IENsaWVudC5nZXRDb25maWcoKS5mcWRuO1xuXG4gICAgICAgIEFwcFN0b3JlLmdldEFwcEJ5SWQoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcbiAgICAgICAgICAgICRzY29wZS5hcHAgPSBhcHA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFwcFN0b3JlLmdldE1hbmlmZXN0KCRyb3V0ZVBhcmFtcy5hcHBTdG9yZUlkLCBmdW5jdGlvbiAoZXJyb3IsIG1hbmlmZXN0KSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcbiAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSBtYW5pZmVzdC50Y3BQb3J0cztcbiAgICAgICAgICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9IG1hbmlmZXN0LmFjY2Vzc1Jlc3RyaWN0aW9uIHx8ICcnO1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBzZXR0aW5nIGlzIHRvIG1hcCBwb3J0cyBhcyB0aGV5IGFyZSBpbiBtYW5pZmVzdFxuICAgICAgICAgICAgZm9yICh2YXIgcG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5nc1twb3J0XS5ob3N0UG9ydCA9IHBhcnNlSW50KHBvcnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgICRzY29wZS5pbnN0YWxsQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9IG51bGw7XG4gICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9IG51bGw7XG5cbiAgICAgICAgdmFyIHBvcnRCaW5kaW5ncyA9IHsgfTtcbiAgICAgICAgZm9yICh2YXIgcG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICBwb3J0QmluZGluZ3NbcG9ydF0gPSAkc2NvcGUucG9ydEJpbmRpbmdzW3BvcnRdLmhvc3RQb3J0O1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50Lmluc3RhbGxBcHAoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsICRzY29wZS5wYXNzd29yZCwgJHNjb3BlLmFwcC50aXRsZSwgeyBsb2NhdGlvbjogJHNjb3BlLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IHBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246ICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiB9LCBmdW5jdGlvbiAoZXJyb3IsIGFwcElkKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDA5KSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gJ0FwcGxpY2F0aW9uIGFscmVhZHkgZXhpc3RzLic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gJ1dyb25nIHBhc3N3b3JkIHByb3ZpZGVkLic7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5hcHAucGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9ICdBcHAgd2l0aCB0aGUgbmFtZSAnICsgJHNjb3BlLmFwcC5uYW1lICsgJyBjYW5ub3QgYmUgaW5zdGFsbGVkLic7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZSgnIy9hcHAvJyArIGFwcElkICsgJy9kZXRhaWxzJyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcblxuICAgIC8vIGhhY2sgZm9yIGF1dG9mb2N1cyB3aXRoIGFuZ3VsYXJcbiAgICAkc2NvcGUuJG9uKCckdmlld0NvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHsgJCgnaW5wdXRbYXV0b2ZvY3VzXTp2aXNpYmxlOmZpcnN0JykuZm9jdXMoKTtcbiAgICAgICAgY29uc29sZS5sb2coJHNjb3BlLmluc3RhbGxfZm9ybSkgfSwgMTAwMCk7XG4gICAgfSk7XG59O1xuIiwiLyogZXhwb3J0ZWQgRGFzaGJvYXJkQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBEYXNoYm9hcmRDb250cm9sbGVyID0gZnVuY3Rpb24gKCkge1xuXG59O1xuIiwiLyogZXhwb3J0ZWQgR3JhcGhzQ29udHJvbGxlciAqL1xuLyogZ2xvYmFsICQ6dHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBHcmFwaHNDb250cm9sbGVyID0gZnVuY3Rpb24gKCRzY29wZSwgQ2xpZW50KSB7XG4gICAgJHNjb3BlLmFjdGl2ZVRhYiA9ICdkYXknO1xuXG4gICAgdmFyIGNwdVVzYWdlVGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoJyArXG4gICAgJ3NjYWxlKGRpdmlkZVNlcmllcygnICtcbiAgICAgICAgJ3N1bVNlcmllcyhjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXN5c3RlbSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LW5pY2UsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS11c2VyKSwnICtcbiAgICAgICAgJ3N1bVNlcmllcyhjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LWlkbGUsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1zeXN0ZW0sY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1uaWNlLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtdXNlcixjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXdhaXQpKSwgMTAwKSwgMCknO1xuXG4gICAgdmFyIG5ldHdvcmtVc2FnZVR4VGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoY29sbGVjdGQubG9jYWxob3N0LmludGVyZmFjZS1ldGgwLmlmX29jdGV0cy50eCwgMCknO1xuICAgIHZhciBuZXR3b3JrVXNhZ2VSeFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5pbnRlcmZhY2UtZXRoMC5pZl9vY3RldHMucngsIDApJztcblxuICAgIHZhciBkaXNrVXNhZ2VBcHBzVXNlZFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5kZi1sb29wMC5kZl9jb21wbGV4LXVzZWQsIDApJztcbiAgICB2YXIgZGlza1VzYWdlRGF0YVVzZWRUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuZGYtbG9vcDEuZGZfY29tcGxleC11c2VkLCAwKSc7XG5cbiAgICBmdW5jdGlvbiByZW5kZXJDcHUoYWN0aXZlVGFiLCBjcHVEYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZENwdSA9IFsgXTtcblxuICAgICAgICBpZiAoY3B1RGF0YSAmJiBjcHVEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkQ3B1ID0gY3B1RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIGNwdUdyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ0NwdUNoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAxMDAsXG4gICAgICAgICAgICBzZXJpZXM6IFt7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkQ3B1LFxuICAgICAgICAgICAgICAgIG5hbWU6ICdjcHUnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGNwdUdyYXBoIH0pO1xuICAgICAgICB2YXIgY3B1WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdDcHVZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5KS50b0ZpeGVkKDIpICsgJyU8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY3B1R3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTmV0d29yayhhY3RpdmVUYWIsIHR4RGF0YSwgcnhEYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZFR4ID0gWyBdLCB0cmFuc2Zvcm1lZFJ4ID0gWyBdO1xuXG4gICAgICAgIGlmICh0eERhdGEgJiYgdHhEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkVHggPSB0eERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuICAgICAgICBpZiAocnhEYXRhICYmIHJ4RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZFJ4ID0gcnhEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcblxuICAgICAgICB2YXIgbmV0d29ya0dyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ05ldHdvcmtDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIHNlcmllczogWyB7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkVHgsXG4gICAgICAgICAgICAgICAgbmFtZTogJ3R4J1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JlZW4nLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkUngsXG4gICAgICAgICAgICAgICAgbmFtZTogJ3J4J1xuICAgICAgICAgICAgfSBdXG4gICAgICAgIH0gKTtcblxuICAgICAgICB2YXIgbmV0d29ya1hBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBuZXR3b3JrR3JhcGggfSk7XG4gICAgICAgIHZhciBuZXR3b3JrWUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBuZXR3b3JrR3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnTmV0d29ya1lBeGlzJyksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBuZXR3b3JrSG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IG5ldHdvcmtHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeS8xMDI0KS50b0ZpeGVkKDIpICsgJ0tCPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldHdvcmtHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgYXBwc1VzZWREYXRhLCBkYXRhVXNlZERhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkQXBwc1VzZWQgPSBbIF0sIHRyYW5zZm9ybWVkRGF0YVVzZWQgPSBbIF07XG5cbiAgICAgICAgaWYgKGFwcHNVc2VkRGF0YSAmJiBhcHBzVXNlZERhdGEuZGF0YXBvaW50cykge1xuICAgICAgICAgICAgdHJhbnNmb3JtZWRBcHBzVXNlZCA9IGFwcHNVc2VkRGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH07IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGFVc2VkRGF0YSAmJiBkYXRhVXNlZERhdGEuZGF0YXBvaW50cykge1xuICAgICAgICAgICAgdHJhbnNmb3JtZWREYXRhVXNlZCA9IGRhdGFVc2VkRGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH07IH0pO1xuICAgICAgICB9XG4gXG4gICAgICAgIHZhciBkaXNrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnRGlza0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAzMCAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMzBnYlxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZEFwcHNVc2VkLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBzJ1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JlZW4nLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkRGF0YVVzZWQsXG4gICAgICAgICAgICAgICAgbmFtZTogJ2RhdGEnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIGRpc2tYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogZGlza0dyYXBoIH0pO1xuICAgICAgICB2YXIgZGlza1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0Rpc2tZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvKDEwMjQgKiAxMDI0ICogMTAyNCkpLnRvRml4ZWQoMikgKyAnR0I8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tMZWdlbmQgPSBuZXcgUmlja3NoYXcuR3JhcGguTGVnZW5kKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza0xlZ2VuZCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRpc2tHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAkc2NvcGUudXBkYXRlR3JhcGhzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYWN0aXZlVGFiID0gJHNjb3BlLmFjdGl2ZVRhYjtcbiAgICAgICB2YXIgZnJvbSA9ICctMjRob3Vycyc7XG4gICAgICAgIHN3aXRjaCAoYWN0aXZlVGFiKSB7XG4gICAgICAgIGNhc2UgJ2RheSc6IGZyb20gPSAnLTI0aG91cnMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnbW9udGgnOiBmcm9tID0gJy0xbW9udGgnOyBicmVhaztcbiAgICAgICAgY2FzZSAneWVhcic6IGZyb20gPSAnLTF5ZWFyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUubG9nKCdpbnRlcm5hbCBlcnJyb3InKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5ncmFwaHMoWyBjcHVVc2FnZVRhcmdldCwgbmV0d29ya1VzYWdlVHhUYXJnZXQsIG5ldHdvcmtVc2FnZVJ4VGFyZ2V0LCBkaXNrVXNhZ2VBcHBzVXNlZFRhcmdldCwgZGlza1VzYWdlRGF0YVVzZWRUYXJnZXQgXSwgZnJvbSwgZnVuY3Rpb24gKGVycm9yLCBkYXRhKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmxvZyhlcnJvcik7XG5cbiAgICAgICAgICAgIHJlbmRlckNwdShhY3RpdmVUYWIsIGRhdGFbMF0pO1xuXG4gICAgICAgICAgICByZW5kZXJOZXR3b3JrKGFjdGl2ZVRhYiwgZGF0YVsxXSwgZGF0YVsyXSk7XG5cbiAgICAgICAgICAgIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkYXRhWzNdLCBkYXRhWzRdKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KCRzY29wZS51cGRhdGVHcmFwaHMpO1xufTtcblxuIiwiLyogZXhwb3J0ZWQgU2VjdXJpdHlDb250cm9sbGVyICovXG4vKiBnbG9iYWwgJCAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBTZWN1cml0eUNvbnRyb2xsZXIgPSBmdW5jdGlvbiAoJHNjb3BlLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuYWN0aXZlQ2xpZW50cyA9IFtdO1xuICAgICRzY29wZS50b2tlbkluVXNlID0gbnVsbDtcblxuICAgICRzY29wZS5yZW1vdmVBY2Nlc3NUb2tlbnMgPSBmdW5jdGlvbiAoY2xpZW50LCBldmVudCkge1xuICAgICAgICBjbGllbnQuX2J1c3kgPSB0cnVlO1xuXG4gICAgICAgIENsaWVudC5kZWxUb2tlbnNCeUNsaWVudElkKGNsaWVudC5pZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICQoZXZlbnQudGFyZ2V0KS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICAgICAgICAgIGNsaWVudC5fYnVzeSA9IGZhbHNlO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUudG9rZW5JblVzZSA9IENsaWVudC5fdG9rZW47XG5cbiAgICAgICAgQ2xpZW50LmdldE9BdXRoQ2xpZW50cyhmdW5jdGlvbiAoZXJyb3IsIGFjdGl2ZUNsaWVudHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAkc2NvcGUuYWN0aXZlQ2xpZW50cyA9IGFjdGl2ZUNsaWVudHM7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufTtcbiIsIi8qIGV4cG9ydGVkIFNldHRpbmdzQ29udHJvbGxlciAqL1xuLyogZ2xvYmFsICQ6dHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cblxudmFyIFNldHRpbmdzQ29udHJvbGxlciA9IGZ1bmN0aW9uICgkc2NvcGUsIENsaWVudCkge1xuICAgICRzY29wZS51c2VyID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLmNvbmZpZyA9IENsaWVudC5nZXRDb25maWcoKTtcbiAgICAkc2NvcGUubmFrZWREb21haW5BcHAgPSBudWxsO1xuICAgICRzY29wZS5kcml2ZXMgPSBbXTtcblxuICAgICRzY29wZS5zZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFwcGlkID0gJHNjb3BlLm5ha2VkRG9tYWluQXBwID8gJHNjb3BlLm5ha2VkRG9tYWluQXBwLmlkIDogbnVsbDtcblxuICAgICAgICBDbGllbnQuc2V0TmFrZWREb21haW4oYXBwaWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignRXJyb3Igc2V0dGluZyBuYWtlZCBkb21haW4nLCBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2hhbmdlUGFzc3dvcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvdXNlcnBhc3N3b3JkJztcbiAgICB9O1xuXG4gICAgJHNjb3BlLmJhY2t1cCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJCgnI2JhY2t1cFByb2dyZXNzTW9kYWwnKS5tb2RhbCgnc2hvdycpO1xuICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IGZhbHNlO1xuXG4gICAgICAgIENsaWVudC5iYWNrdXAoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAvLyBub3cgc3RhcnQgcXVlcnlcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNoZWNrSWZEb25lKCkge1xuICAgICAgICAgICAgICAgIENsaWVudC52ZXJzaW9uKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgMTAwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgJCgnI2JhY2t1cFByb2dyZXNzTW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCA1MDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5yZWJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNyZWJvb3RNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG4gICAgICAgICQoJyNyZWJvb3RQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcbiAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBDbGllbnQucmVib290KGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gbm93IHN0YXJ0IHF1ZXJ5XG4gICAgICAgICAgICBmdW5jdGlvbiBjaGVja0lmRG9uZSgpIHtcbiAgICAgICAgICAgICAgICBDbGllbnQudmVyc2lvbihmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDEwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICQoJyNyZWJvb3RQcm9ncmVzc01vZGFsJykubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh3aW5kb3cubG9jYXRpb24ucmVsb2FkLmJpbmQod2luZG93LmxvY2F0aW9uLCB0cnVlKSwgMTAwMCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCA1MDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS51cGRhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyN1cGRhdGVNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG4gICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcbiAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBDbGllbnQudXBkYXRlKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gbm93IHN0YXJ0IHF1ZXJ5XG4gICAgICAgICAgICBmdW5jdGlvbiBjaGVja0lmRG9uZSgpIHtcbiAgICAgICAgICAgICAgICBDbGllbnQudmVyc2lvbihmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDEwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICQoJyN1cGRhdGVQcm9ncmVzc01vZGFsJykubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dCh3aW5kb3cubG9jYXRpb24ucmVsb2FkLmJpbmQod2luZG93LmxvY2F0aW9uLCB0cnVlKSwgMTAwMCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCA1MDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vbkNvbmZpZyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS50b2tlbkluVXNlID0gQ2xpZW50Ll90b2tlbjtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBhcHAgbGlzdCcpO1xuICAgICAgICAgICAgJHNjb3BlLmFwcHMgPSBhcHBzO1xuXG4gICAgICAgICAgICBDbGllbnQuZ2V0TmFrZWREb21haW4oZnVuY3Rpb24gKGVycm9yLCBhcHBpZCkge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAkc2NvcGUuYXBwcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoJHNjb3BlLmFwcHNbaV0uaWQgPT09IGFwcGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAkc2NvcGUubmFrZWREb21haW5BcHAgPSAkc2NvcGUuYXBwc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIENsaWVudC5zdGF0cyhmdW5jdGlvbiAoZXJyb3IsIHN0YXRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUuZHJpdmVzID0gc3RhdHMuZHJpdmVzO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufTtcbiIsIi8qIGV4cG9ydGVkIFVzZXJDcmVhdGVDb250cm9sbGVyICovXG5cbid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gVXNlckNyZWF0ZUNvbnRyb2xsZXIgKCRzY29wZSwgJHJvdXRlUGFyYW1zLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcblxuICAgICRzY29wZS51c2VybmFtZSA9ICcnO1xuICAgICRzY29wZS5lbWFpbCA9ICcnO1xuICAgICRzY29wZS5hbHJlYWR5VGFrZW4gPSAnJztcblxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTQ5NzQ4MS9qYXZhc2NyaXB0LXBhc3N3b3JkLWdlbmVyYXRvciMxNDk3NTEyXG4gICAgZnVuY3Rpb24gZ2VuZXJhdGVQYXNzd29yZCgpIHtcbiAgICAgICAgdmFyIGxlbmd0aCA9IDgsXG4gICAgICAgICAgICBjaGFyc2V0ID0gJ2FiY2RlZmdoaWprbG5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODknLFxuICAgICAgICAgICAgcmV0VmFsID0gJyc7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBuID0gY2hhcnNldC5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgcmV0VmFsICs9IGNoYXJzZXQuY2hhckF0KE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG4pKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmV0VmFsO1xuICAgIH1cblxuICAgICRzY29wZS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS5hbHJlYWR5VGFrZW4gPSAnJztcblxuICAgICAgICAkc2NvcGUuZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICB2YXIgcGFzc3dvcmQgPSBnZW5lcmF0ZVBhc3N3b3JkKCk7XG5cbiAgICAgICAgQ2xpZW50LmNyZWF0ZVVzZXIoJHNjb3BlLnVzZXJuYW1lLCBwYXNzd29yZCwgJHNjb3BlLmVtYWlsLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDkpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuYWxyZWFkeVRha2VuID0gJHNjb3BlLnVzZXJuYW1lO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKCdVc2VybmFtZSBhbHJlYWR5IHRha2VuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBjcmVhdGUgdXNlci4nLCBlcnJvcik7XG5cbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvdXNlcmxpc3QnO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgIH07XG59XG4iLCIvKiBleHBvcnRlZCBVc2VyTGlzdENvbnRyb2xsZXIgKi9cbi8qIGdsb2JhbCAkOnRydWUgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBVc2VyTGlzdENvbnRyb2xsZXIgKCRzY29wZSwgQ2xpZW50KSB7XG4gICAgJHNjb3BlLnJlYWR5ID0gZmFsc2U7XG4gICAgJHNjb3BlLnVzZXJzID0gW107XG4gICAgJHNjb3BlLnVzZXJJbmZvID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLnVzZXJEZWxldGVGb3JtID0ge1xuICAgICAgICB1c2VybmFtZTogJycsXG4gICAgICAgIHBhc3N3b3JkOiAnJ1xuICAgIH07XG5cbiAgICAkc2NvcGUuaXNNZSA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiB1c2VyLnVzZXJuYW1lID09PSBDbGllbnQuZ2V0VXNlckluZm8oKS51c2VybmFtZTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmlzQWRtaW4gPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gISF1c2VyLmFkbWluO1xuICAgIH07XG5cbiAgICAkc2NvcGUudG9nZ2xlQWRtaW4gPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICBDbGllbnQuc2V0QWRtaW4odXNlci51c2VybmFtZSwgIXVzZXIuYWRtaW4sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIHVzZXIuYWRtaW4gPSAhdXNlci5hZG1pbjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5kZWxldGVVc2VyID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgLy8gVE9ETyBhZGQgYnVzeSBpbmRpY2F0b3IgYW5kIGJsb2NrIGZvcm1cbiAgICAgICAgaWYgKCRzY29wZS51c2VyRGVsZXRlRm9ybS51c2VybmFtZSAhPT0gdXNlci51c2VybmFtZSkgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VzZXJuYW1lIGRvZXMgbm90IG1hdGNoJyk7XG5cbiAgICAgICAgQ2xpZW50LnJlbW92ZVVzZXIodXNlci51c2VybmFtZSwgJHNjb3BlLnVzZXJEZWxldGVGb3JtLnBhc3N3b3JkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDEpIHJldHVybiBjb25zb2xlLmVycm9yKCdXcm9uZyBwYXNzd29yZCcpO1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGRlbGV0ZSB1c2VyLicsIGVycm9yKTtcblxuICAgICAgICAgICAgJCgnI3VzZXJEZWxldGVNb2RhbC0nICsgdXNlci51c2VybmFtZSkubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAgICAgcmVmcmVzaCgpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcmVmcmVzaCgpIHtcbiAgICAgICAgQ2xpZW50Lmxpc3RVc2VycyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGdldCB1c2VyIGxpc3RpbmcuJywgZXJyb3IpO1xuXG4gICAgICAgICAgICAkc2NvcGUudXNlcnMgPSByZXN1bHQudXNlcnM7XG4gICAgICAgICAgICAkc2NvcGUucmVhZHkgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAkc2NvcGUuYWRkVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy91c2VyY3JlYXRlJztcbiAgICB9O1xuXG4gICAgcmVmcmVzaCgpO1xufVxuIiwiLyogZXhwb3J0ZWQgVXNlclBhc3N3b3JkQ29udHJvbGxlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIFVzZXJQYXNzd29yZENvbnRyb2xsZXIgKCRzY29wZSwgJHJvdXRlUGFyYW1zLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuYWN0aXZlID0gZmFsc2U7XG4gICAgJHNjb3BlLmN1cnJlbnRQYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS5uZXdQYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS5yZXBlYXRQYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MgPSB7fTtcblxuICAgICRzY29wZS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MuY3VycmVudFBhc3N3b3JkID0gJyc7XG4gICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MubmV3UGFzc3dvcmQgPSAnJztcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5yZXBlYXRQYXNzd29yZCA9ICcnO1xuXG4gICAgICAgIGlmICgkc2NvcGUubmV3UGFzc3dvcmQgIT09ICRzY29wZS5yZXBlYXRQYXNzd29yZCkge1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0UmVwZWF0UGFzc3dvcmQnKS5mb2N1cygpO1xuICAgICAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5yZXBlYXRQYXNzd29yZCA9ICdoYXMtZXJyb3InO1xuICAgICAgICAgICAgJHNjb3BlLnJlcGVhdFBhc3N3b3JkID0gJyc7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAkc2NvcGUuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgQ2xpZW50LmNoYW5nZVBhc3N3b3JkKCRzY29wZS5jdXJyZW50UGFzc3dvcmQsICRzY29wZS5uZXdQYXNzd29yZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAzKSB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0Q3VycmVudFBhc3N3b3JkJykuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLmN1cnJlbnRQYXNzd29yZCA9ICdoYXMtZXJyb3InO1xuICAgICAgICAgICAgICAgICRzY29wZS5jdXJyZW50UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICAkc2NvcGUubmV3UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICAkc2NvcGUucmVwZWF0UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gY2hhbmdlIHBhc3N3b3JkLicsIGVycm9yKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkc2NvcGUuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dEN1cnJlbnRQYXNzd29yZCcpLmZvY3VzKCk7XG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=