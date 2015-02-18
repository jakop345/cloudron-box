'use strict';

/* global angular:false */

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'angular-md5']);

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
    }).when('/account', {
        controller: 'AccountController',
        templateUrl: 'views/account.html'
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
            progress: {}
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
        this._config.progress = config.progress;

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

    Client.prototype.installApp = function (id, version, password, title, config, callback) {
        var that = this;
        var data = { appStoreId: id, version: version, password: password, location: config.location, portBindings: config.portBindings, accessRestriction: config.accessRestriction };
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

        $http.get(Client.getConfig().apiServerOrigin + '/api/v1/appstore/apps', { params: { boxVersion: Client.getConfig().version } }).success(function (data, status) {
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

'use strict';

angular.module('Application').controller('MainController', ['$scope', '$route', '$interval', 'Client', function ($scope, $route, $interval, Client) {
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

                // check if we are actually updateing
                if (Client.getConfig().progress.update) window.location.href = '/update.html';

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

                        $scope.initialized = true;
                    });
                });
            });
        } else {
            $scope.login();
        }
    });

    // wait till the view has loaded until showing a modal dialog
    Client.onConfig(function (config) {
        if (config.progress.update) {
            window.location.href = '/update.html';
        }
    });
}]);

'use strict';

angular.module('Application').controller('AccountController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.changePassword = function () {
        $location.path('/userpassword');
        // window.location.href = '#/userpassword';
    };
}]);

'use strict';

angular.module('Application').controller('AppConfigureController', ['$scope', '$routeParams', '$location', 'Client', function ($scope, $routeParams, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

/* global $:true */
/* global Rickshaw:true */

'use strict';

angular.module('Application').controller('AppDetailsController', ['$scope', '$http', '$routeParams', '$location', 'Client', function ($scope, $http, $routeParams, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

'use strict';

angular.module('Application').controller('AppInstallController', ['$scope', '$routeParams', '$location', 'Client', 'AppStore', '$timeout', function ($scope, $routeParams, $location, Client, AppStore, $timeout) {
    if (!Client.getUserInfo().admin) $location.path('/');

    $scope.app = null;
    $scope.password = '';
    $scope.location = '';
    $scope.accessRestriction = '';
    $scope.disabled = false;
    $scope.error = { };
    $scope.domain = '';
    $scope.version = null;
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
            $scope.version = manifest.version;
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

        Client.installApp($routeParams.appStoreId, $scope.version, $scope.password, $scope.app.title, { location: $scope.location, portBindings: portBindings, accessRestriction: $scope.accessRestriction }, function (error, appId) {
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
}]);

'use strict';

angular.module('Application').controller('AppStoreController', ['$scope', '$location', 'Client', 'AppStore', function ($scope, $location, Client, AppStore) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

'use strict';

angular.module('Application').controller('DashboardController', function () {

});

/* global:Rickshaw:true */

'use strict';

angular.module('Application').controller('GraphsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

'use strict';

angular.module('Application').controller('SecurityController', ['$scope', 'Client', function ($scope, Client) {
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
}]);

'use strict';

angular.module('Application').controller('SettingsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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

        $scope.$parent.initialized = false;

        Client.update(function (error) {
            if (error) console.error(error);

            window.location.href = '/update.html';
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
}]);

'use strict';

angular.module('Application').controller('UserCreateController', ['$scope', '$routeParams', '$location', 'Client', function ($scope, $routeParams, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

'use strict';

angular.module('Application').controller('UserListController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

'use strict';

angular.module('Application').controller('UserPasswordController', ['$scope', '$routeParams', '$location', 'Client', function ($scope, $routeParams, $location, Client) {
    if (!Client.getUserInfo().admin) $location.path('/');

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
}]);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIiwiY2xpZW50LmpzIiwiYXBwc3RvcmUuanMiLCJtYWluLmpzIiwiYWNjb3VudC5qcyIsImFwcGNvbmZpZ3VyZS5qcyIsImFwcGRldGFpbHMuanMiLCJhcHBpbnN0YWxsLmpzIiwiZGFzaGJvYXJkLmpzIiwiZ3JhcGhzLmpzIiwic2VjdXJpdHkuanMiLCJzZXR0aW5ncy5qcyIsInVzZXJjcmVhdGUuanMiLCJ1c2VybGlzdC5qcyIsInVzZXJwYXNzd29yZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN4ZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUw1RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QU1yRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuLyogZ2xvYmFsIGFuZ3VsYXI6ZmFsc2UgKi9cblxuLy8gY3JlYXRlIG1haW4gYXBwbGljYXRpb24gbW9kdWxlXG52YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJywgWyduZ1JvdXRlJywgJ25nQW5pbWF0ZScsICdhbmd1bGFyLW1kNSddKTtcblxuLy8gc2V0dXAgYWxsIG1ham9yIGFwcGxpY2F0aW9uIHJvdXRlc1xuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHJvdXRlUHJvdmlkZXIpIHtcbiAgICAkcm91dGVQcm92aWRlci53aGVuKCcvJywge1xuICAgICAgICByZWRpcmVjdFRvOiAnL2Rhc2hib2FyZCdcbiAgICB9KS53aGVuKCcvZGFzaGJvYXJkJywge1xuICAgICAgICBjb250cm9sbGVyOiAnRGFzaGJvYXJkQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvZGFzaGJvYXJkLmh0bWwnXG4gICAgfSkud2hlbignL3VzZXJjcmVhdGUnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdVc2VyQ3JlYXRlQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvdXNlcmNyZWF0ZS5odG1sJ1xuICAgIH0pLndoZW4oJy91c2VycGFzc3dvcmQnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdVc2VyUGFzc3dvcmRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy91c2VycGFzc3dvcmQuaHRtbCdcbiAgICB9KS53aGVuKCcvdXNlcmxpc3QnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdVc2VyTGlzdENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3VzZXJsaXN0Lmh0bWwnXG4gICAgfSkud2hlbignL2FwcHN0b3JlJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwU3RvcmVDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBzdG9yZS5odG1sJ1xuICAgIH0pLndoZW4oJy9hcHAvOmFwcFN0b3JlSWQvaW5zdGFsbCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FwcEluc3RhbGxDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBpbnN0YWxsLmh0bWwnXG4gICAgfSkud2hlbignL2FwcC86YXBwSWQvY29uZmlndXJlJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwQ29uZmlndXJlQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvYXBwY29uZmlndXJlLmh0bWwnXG4gICAgfSkud2hlbignL2FwcC86YXBwSWQvZGV0YWlscycsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FwcERldGFpbHNDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBkZXRhaWxzLmh0bWwnXG4gICAgfSkud2hlbignL3NldHRpbmdzJywge1xuICAgICAgICBjb250cm9sbGVyOiAnU2V0dGluZ3NDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9zZXR0aW5ncy5odG1sJ1xuICAgIH0pLndoZW4oJy9hY2NvdW50Jywge1xuICAgICAgICBjb250cm9sbGVyOiAnQWNjb3VudENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FjY291bnQuaHRtbCdcbiAgICB9KS53aGVuKCcvZ3JhcGhzJywge1xuICAgICAgICBjb250cm9sbGVyOiAnR3JhcGhzQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvZ3JhcGhzLmh0bWwnXG4gICAgfSkud2hlbignL3NlY3VyaXR5Jywge1xuICAgICAgICBjb250cm9sbGVyOiAnU2VjdXJpdHlDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9zZWN1cml0eS5odG1sJ1xuICAgIH0pLm90aGVyd2lzZSh7IHJlZGlyZWN0VG86ICcvJ30pO1xufSk7XG5cbmFwcC5maWx0ZXIoJ2luc3RhbGxhdGlvbkFjdGl2ZScsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBmdW5jdGlvbihpbnB1dCkge1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdlcnJvcicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnaW5zdGFsbGVkJykgcmV0dXJuIGZhbHNlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xufSk7XG5cbmFwcC5maWx0ZXIoJ2luc3RhbGxhdGlvblN0YXRlTGFiZWwnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZXJyb3InKSByZXR1cm4gJ0Vycm9yJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnc3ViZG9tYWluX2Vycm9yJykgcmV0dXJuICdFcnJvcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2luc3RhbGxlZCcpIHJldHVybiAnSW5zdGFsbGVkJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZG93bmxvYWRpbmdfaW1hZ2UnKSByZXR1cm4gJ0Rvd25sb2FkaW5nJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncGVuZGluZ19pbnN0YWxsJykgcmV0dXJuICdJbnN0YWxsaW5nJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncGVuZGluZ191bmluc3RhbGwnKSByZXR1cm4gJ1VuaW5zdGFsbGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2NyZWF0aW5nX2NvbnRhaW5lcicpIHJldHVybiAnQ29udGFpbmVyJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZG93bmxvYWRpbmdfbWFuaWZlc3QnKSByZXR1cm4gJ01hbmlmZXN0JztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnY3JlYXRpbmdfdm9sdW1lJykgcmV0dXJuICdWb2x1bWUnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyZWdpc3RlcmluZ19zdWJkb21haW4nKSByZXR1cm4gJ1N1YmRvbWFpbic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2FsbG9jYXRlZF9vYXV0aF9jcmVkZW50aWFscycpIHJldHVybiAnT0F1dGgnO1xuXG4gICAgICAgIHJldHVybiBpbnB1dDtcbiAgICB9O1xufSk7XG5cbmFwcC5maWx0ZXIoJ2FjY2Vzc1Jlc3RyaWN0aW9uTGFiZWwnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnJykgcmV0dXJuICdwdWJsaWMnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyb2xlVXNlcicpIHJldHVybiAncHJpdmF0ZSc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3JvbGVBZG1pbicpIHJldHVybiAncHJpdmF0ZSAoQWRtaW5zIG9ubHkpJztcblxuICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgfTtcbn0pO1xuXG4vLyBjdXN0b20gZGlyZWN0aXZlIGZvciBkeW5hbWljIG5hbWVzIGluIGZvcm1zXG4vLyBTZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8yMzYxNjU3OC9pc3N1ZS1yZWdpc3RlcmluZy1mb3JtLWNvbnRyb2wtd2l0aC1pbnRlcnBvbGF0ZWQtbmFtZSNhbnN3ZXItMjM2MTc0MDFcbmFwcC5kaXJlY3RpdmUoJ2xhdGVyTmFtZScsIGZ1bmN0aW9uICgpIHsgICAgICAgICAgICAgICAgICAgLy8gKDIpXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgICAgcmVxdWlyZTogWyc/bmdNb2RlbCcsICdeP2Zvcm0nXSwgICAgICAgICAgICAgICAgICAgLy8gKDMpXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIHBvc3RMaW5rKHNjb3BlLCBlbGVtLCBhdHRycywgY3RybHMpIHtcbiAgICAgICAgICAgIGF0dHJzLiRzZXQoJ25hbWUnLCBhdHRycy5sYXRlck5hbWUpO1xuXG4gICAgICAgICAgICB2YXIgbW9kZWxDdHJsID0gY3RybHNbMF07ICAgICAgICAgICAgICAgICAgICAgIC8vICgzKVxuICAgICAgICAgICAgdmFyIGZvcm1DdHJsICA9IGN0cmxzWzFdOyAgICAgICAgICAgICAgICAgICAgICAvLyAoMylcbiAgICAgICAgICAgIGlmIChtb2RlbEN0cmwgJiYgZm9ybUN0cmwpIHtcbiAgICAgICAgICAgICAgICBtb2RlbEN0cmwuJG5hbWUgPSBhdHRycy5uYW1lOyAgICAgICAgICAgICAgLy8gKDQpXG4gICAgICAgICAgICAgICAgZm9ybUN0cmwuJGFkZENvbnRyb2wobW9kZWxDdHJsKTsgICAgICAgICAgIC8vICgyKVxuICAgICAgICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcm1DdHJsLiRyZW1vdmVDb250cm9sKG1vZGVsQ3RybCk7ICAgIC8vICg1KVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbn0pOyIsIid1c2Ugc3RyaWN0JztcblxuLyogZ2xvYmFsIGFuZ3VsYXIgKi9cbi8qIGdsb2JhbCBFdmVudFNvdXJjZSAqL1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5zZXJ2aWNlKCdDbGllbnQnLCBmdW5jdGlvbiAoJGh0dHAsIG1kNSkge1xuICAgIHZhciBjbGllbnQgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gQ2xpZW50RXJyb3Ioc3RhdHVzQ29kZSwgbWVzc2FnZSkge1xuICAgICAgICBFcnJvci5jYWxsKHRoaXMpO1xuICAgICAgICB0aGlzLm5hbWUgPSB0aGlzLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgIHRoaXMuc3RhdHVzQ29kZSA9IHN0YXR1c0NvZGU7XG4gICAgICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZSA9IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gNDAxKSByZXR1cm4gY2xpZW50LmxvZ291dCgpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIENsaWVudCgpIHtcbiAgICAgICAgdGhpcy5fcmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY29uZmlnTGlzdGVuZXIgPSBbXTtcbiAgICAgICAgdGhpcy5fcmVhZHlMaXN0ZW5lciA9IFtdO1xuICAgICAgICB0aGlzLl91c2VySW5mbyA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiBudWxsLFxuICAgICAgICAgICAgZW1haWw6IG51bGwsXG4gICAgICAgICAgICBhZG1pbjogZmFsc2VcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl9jbGllbnRJZCA9ICdjaWQtd2ViYWRtaW4nO1xuICAgICAgICB0aGlzLl9jbGllbnRTZWNyZXQgPSAndW51c2VkJztcbiAgICAgICAgdGhpcy5fY29uZmlnID0ge1xuICAgICAgICAgICAgYXBpU2VydmVyT3JpZ2luOiBudWxsLFxuICAgICAgICAgICAgd2ViU2VydmVyT3JpZ2luOiBudWxsLFxuICAgICAgICAgICAgZnFkbjogbnVsbCxcbiAgICAgICAgICAgIGlwOiBudWxsLFxuICAgICAgICAgICAgcmV2aXNpb246IG51bGwsXG4gICAgICAgICAgICB1cGRhdGU6IG51bGwsXG4gICAgICAgICAgICBpc0RldjogZmFsc2UsXG4gICAgICAgICAgICBwcm9ncmVzczoge31cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5faW5zdGFsbGVkQXBwcyA9IFtdO1xuXG4gICAgICAgIHRoaXMuc2V0VG9rZW4obG9jYWxTdG9yYWdlLnRva2VuKTtcbiAgICB9XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFJlYWR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5fcmVhZHkpIHJldHVybjtcblxuICAgICAgICB0aGlzLl9yZWFkeSA9IHRydWU7XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLm9uUmVhZHkgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlYWR5KSBjYWxsYmFjaygpO1xuICAgICAgICB0aGlzLl9yZWFkeUxpc3RlbmVyLnB1c2goY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLm9uQ29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyLnB1c2goY2FsbGJhY2spO1xuICAgICAgICBjYWxsYmFjayh0aGlzLl9jb25maWcpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFVzZXJJbmZvID0gZnVuY3Rpb24gKHVzZXJJbmZvKSB7XG4gICAgICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIGFuZ3VsYXIgYmluZGluZ3MgYWxpdmUsIHNldCBlYWNoIHByb3BlcnR5IGluZGl2aWR1YWxseVxuICAgICAgICB0aGlzLl91c2VySW5mby51c2VybmFtZSA9IHVzZXJJbmZvLnVzZXJuYW1lO1xuICAgICAgICB0aGlzLl91c2VySW5mby5lbWFpbCA9IHVzZXJJbmZvLmVtYWlsO1xuICAgICAgICB0aGlzLl91c2VySW5mby5hZG1pbiA9ICEhdXNlckluZm8uYWRtaW47XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvLmdyYXZhdGFyID0gJ2h0dHBzOi8vd3d3LmdyYXZhdGFyLmNvbS9hdmF0YXIvJyArIG1kNS5jcmVhdGVIYXNoKHVzZXJJbmZvLmVtYWlsLnRvTG93ZXJDYXNlKCkpICsgJy5qcGc/cz0yNCZkPW1tJztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRDb25maWcgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIGFuZ3VsYXIgYmluZGluZ3MgYWxpdmUsIHNldCBlYWNoIHByb3BlcnR5IGluZGl2aWR1YWxseSAoVE9ETzoganVzdCB1c2UgYW5ndWxhci5jb3B5ID8pXG4gICAgICAgIHRoaXMuX2NvbmZpZy5hcGlTZXJ2ZXJPcmlnaW4gPSBjb25maWcuYXBpU2VydmVyT3JpZ2luO1xuICAgICAgICB0aGlzLl9jb25maWcud2ViU2VydmVyT3JpZ2luID0gY29uZmlnLndlYlNlcnZlck9yaWdpbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLnZlcnNpb24gPSBjb25maWcudmVyc2lvbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLmZxZG4gPSBjb25maWcuZnFkbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLmlwID0gY29uZmlnLmlwO1xuICAgICAgICB0aGlzLl9jb25maWcucmV2aXNpb24gPSBjb25maWcucmV2aXNpb247XG4gICAgICAgIHRoaXMuX2NvbmZpZy51cGRhdGUgPSBjb25maWcudXBkYXRlO1xuICAgICAgICB0aGlzLl9jb25maWcuaXNEZXYgPSBjb25maWcuaXNEZXY7XG4gICAgICAgIHRoaXMuX2NvbmZpZy5wcm9ncmVzcyA9IGNvbmZpZy5wcm9ncmVzcztcblxuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy5fY29uZmlnTGlzdGVuZXIuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHRoYXQuX2NvbmZpZyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEluc3RhbGxlZEFwcHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9pbnN0YWxsZWRBcHBzO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldFVzZXJJbmZvID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdXNlckluZm87XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0Q29uZmlnID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29uZmlnO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFRva2VuID0gZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICAgICRodHRwLmRlZmF1bHRzLmhlYWRlcnMuY29tbW9uLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyB0b2tlbjtcbiAgICAgICAgaWYgKCF0b2tlbikgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3Rva2VuJyk7XG4gICAgICAgIGVsc2UgbG9jYWxTdG9yYWdlLnRva2VuID0gdG9rZW47XG4gICAgICAgIHRoaXMuX3Rva2VuID0gdG9rZW47XG4gICAgfTtcblxuICAgIC8qXG4gICAgICogUmVzdCBBUEkgd3JhcHBlcnNcbiAgICAgKi9cbiAgICBDbGllbnQucHJvdG90eXBlLmNvbmZpZyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vY29uZmlnJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVzZXJJbmZvID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9wcm9maWxlJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmluc3RhbGxBcHAgPSBmdW5jdGlvbiAoaWQsIHZlcnNpb24sIHBhc3N3b3JkLCB0aXRsZSwgY29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgIHZhciBkYXRhID0geyBhcHBTdG9yZUlkOiBpZCwgdmVyc2lvbjogdmVyc2lvbiwgcGFzc3dvcmQ6IHBhc3N3b3JkLCBsb2NhdGlvbjogY29uZmlnLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IGNvbmZpZy5wb3J0QmluZGluZ3MsIGFjY2Vzc1Jlc3RyaWN0aW9uOiBjb25maWcuYWNjZXNzUmVzdHJpY3Rpb24gfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzL2luc3RhbGwnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIC8vIHB1dCBuZXcgYXBwIHdpdGggYW1lbmRlZCB0aXRsZSBpbiBjYWNoZVxuICAgICAgICAgICAgZGF0YS5tYW5pZmVzdCA9IHsgdGl0bGU6IHRpdGxlIH07XG4gICAgICAgICAgICB0aGF0Ll9pbnN0YWxsZWRBcHBzLnB1c2goZGF0YSk7XG5cbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuaWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY29uZmlndXJlQXBwID0gZnVuY3Rpb24gKGlkLCBwYXNzd29yZCwgY29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgYXBwSWQ6IGlkLCBwYXNzd29yZDogcGFzc3dvcmQsIGxvY2F0aW9uOiBjb25maWcubG9jYXRpb24sIHBvcnRCaW5kaW5nczogY29uZmlnLnBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246IGNvbmZpZy5hY2Nlc3NSZXN0cmljdGlvbiB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy9jb25maWd1cmUnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudXBkYXRlQXBwID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy91cGRhdGUnLCB7IH0pLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdGFydEFwcCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7IH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL3N0YXJ0JywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnN0b3BBcHAgPSBmdW5jdGlvbiAoaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0geyB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy9zdG9wJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnZlcnNpb24gPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3N0YXR1cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5pc1NlcnZlckZpcnN0VGltZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vc3RhdHVzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCAhZGF0YS5hY3RpdmF0ZWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0TmFrZWREb21haW4gPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL3NldHRpbmdzL25ha2VkX2RvbWFpbicpXG4gICAgICAgIC5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFwcGlkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldE5ha2VkRG9tYWluID0gZnVuY3Rpb24gKGFwcGlkLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL3NldHRpbmdzL25ha2VkX2RvbWFpbicsIHsgYXBwaWQ6IGFwcGlkIH0pLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cykpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHBzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9hcHBzJykuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hcHBzKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcCA9IGZ1bmN0aW9uIChhcHBJZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGFwcEZvdW5kID0gbnVsbDtcbiAgICAgICAgdGhpcy5faW5zdGFsbGVkQXBwcy5zb21lKGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgICAgIGlmIChhcHAuaWQgPT09IGFwcElkKSB7XG4gICAgICAgICAgICAgICAgYXBwRm91bmQgPSBhcHA7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGFwcEZvdW5kKSByZXR1cm4gY2FsbGJhY2sobnVsbCwgYXBwRm91bmQpO1xuICAgICAgICBlbHNlIHJldHVybiBjYWxsYmFjayhuZXcgRXJyb3IoJ0FwcCBub3QgZm91bmQnKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUucmVtb3ZlQXBwID0gZnVuY3Rpb24gKGFwcElkLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy91bmluc3RhbGwnKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwTG9nU3RyZWFtID0gZnVuY3Rpb24gKGFwcElkKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBuZXcgRXZlbnRTb3VyY2UoJy9hcGkvdjEvYXBwcy8nICsgYXBwSWQgKyAnL2xvZ3N0cmVhbScpO1xuICAgICAgICByZXR1cm4gc291cmNlO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcExvZ1VybCA9IGZ1bmN0aW9uIChhcHBJZCkge1xuICAgICAgICByZXR1cm4gJy9hcGkvdjEvYXBwcy8nICsgYXBwSWQgKyAnL2xvZ3M/YWNjZXNzX3Rva2VuPScgKyB0aGlzLl90b2tlbjtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRBZG1pbiA9IGZ1bmN0aW9uICh1c2VybmFtZSwgYWRtaW4sIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBwYXlsb2FkID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgICAgYWRtaW46IGFkbWluXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS91c2Vycy8nICsgdXNlcm5hbWUgKyAnL2FkbWluJywgcGF5bG9hZCkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNyZWF0ZUFkbWluID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBwYXNzd29yZCwgZW1haWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBwYXlsb2FkID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgICAgcGFzc3dvcmQ6IHBhc3N3b3JkLFxuICAgICAgICAgICAgZW1haWw6IGVtYWlsXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvY2xvdWRyb24vYWN0aXZhdGUnLCBwYXlsb2FkKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAxIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcblxuICAgICAgICAgICAgdGhhdC5zZXRUb2tlbihkYXRhLnRva2VuKTtcbiAgICAgICAgICAgIHRoYXQuc2V0VXNlckluZm8oeyB1c2VybmFtZTogdXNlcm5hbWUsIGVtYWlsOiBlbWFpbCwgYWRtaW46IHRydWUgfSk7XG5cbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYWN0aXZhdGVkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmxpc3RVc2VycyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvdXNlcnMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc3RhdHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3N0YXRzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldE9BdXRoQ2xpZW50cyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvb2F1dGgvY2xpZW50cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5jbGllbnRzKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmRlbFRva2Vuc0J5Q2xpZW50SWQgPSBmdW5jdGlvbiAoaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmRlbGV0ZSgnL2FwaS92MS9vYXV0aC9jbGllbnRzLycgKyBpZCArICcvdG9rZW5zJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi91cGRhdGUnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUucmVib290ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9yZWJvb3QnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuYmFja3VwID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvY2xvdWRyb24vYmFja3VwcycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRDZXJ0aWZpY2F0ZSA9IGZ1bmN0aW9uIChjZXJ0aWZpY2F0ZUZpbGUsIGtleUZpbGUsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCd3aWxsIHNldCBjZXJ0aWZpY2F0ZScpO1xuXG4gICAgICAgIHZhciBmZCA9IG5ldyBGb3JtRGF0YSgpO1xuICAgICAgICBmZC5hcHBlbmQoJ2NlcnRpZmljYXRlJywgY2VydGlmaWNhdGVGaWxlKTtcbiAgICAgICAgZmQuYXBwZW5kKCdrZXknLCBrZXlGaWxlKTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2NlcnRpZmljYXRlJywgZmQsIHtcbiAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6IHVuZGVmaW5lZCB9LFxuICAgICAgICAgICAgdHJhbnNmb3JtUmVxdWVzdDogYW5ndWxhci5pZGVudGl0eVxuICAgICAgICB9KS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5ncmFwaHMgPSBmdW5jdGlvbiAodGFyZ2V0cywgZnJvbSwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHtcbiAgICAgICAgICAgIHBhcmFtczoge1xuICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0cyxcbiAgICAgICAgICAgICAgICBmb3JtYXQ6ICdqc29uJyxcbiAgICAgICAgICAgICAgICBmcm9tOiBmcm9tXG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL2dyYXBocycsIGNvbmZpZykuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jcmVhdGVVc2VyID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBlbWFpbCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBlbWFpbDogZW1haWxcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL3VzZXJzJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlbW92ZVVzZXIgPSBmdW5jdGlvbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwKHsgbWV0aG9kOiAnREVMRVRFJywgdXJsOiAnL2FwaS92MS91c2Vycy8nICsgdXNlcm5hbWUsIGRhdGE6IGRhdGEsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9fSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY2hhbmdlUGFzc3dvcmQgPSBmdW5jdGlvbiAoY3VycmVudFBhc3N3b3JkLCBuZXdQYXNzd29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICBwYXNzd29yZDogY3VycmVudFBhc3N3b3JkLFxuICAgICAgICAgICAgbmV3UGFzc3dvcmQ6IG5ld1Bhc3N3b3JkXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS91c2Vycy8nICsgdGhpcy5fdXNlckluZm8udXNlcm5hbWUgKyAnL3Bhc3N3b3JkJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlZnJlc2hDb25maWcgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgICAgIGNhbGxiYWNrID0gdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBmdW5jdGlvbiAoKSB7fTtcblxuICAgICAgICB0aGlzLmNvbmZpZyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xuXG4gICAgICAgICAgICB0aGF0LnNldENvbmZpZyhyZXN1bHQpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlZnJlc2hJbnN0YWxsZWRBcHBzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICBjYWxsYmFjayA9IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogZnVuY3Rpb24gKCkge307XG5cbiAgICAgICAgdGhpcy5nZXRBcHBzKGZ1bmN0aW9uIChlcnJvciwgYXBwcykge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xuXG4gICAgICAgICAgICAvLyBpbnNlcnQgb3IgdXBkYXRlIG5ldyBhcHBzXG4gICAgICAgICAgICBhcHBzLmZvckVhY2goZnVuY3Rpb24gKGFwcCkge1xuICAgICAgICAgICAgICAgIHZhciBmb3VuZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGF0Ll9pbnN0YWxsZWRBcHBzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGF0Ll9pbnN0YWxsZWRBcHBzW2ldLmlkID09PSBhcHAuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gaTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICBhbmd1bGFyLmNvcHkoYXBwLCB0aGF0Ll9pbnN0YWxsZWRBcHBzW2ZvdW5kXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5faW5zdGFsbGVkQXBwcy5wdXNoKGFwcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIGZpbHRlciBvdXQgb2xkIGVudHJpZXMsIGdvaW5nIGJhY2t3YXJkcyB0byBhbGxvdyBzcGxpY2luZ1xuICAgICAgICAgICAgZm9yKHZhciBpID0gdGhhdC5faW5zdGFsbGVkQXBwcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICAgICAgICAgIGlmICghYXBwcy5zb21lKGZ1bmN0aW9uIChlbGVtKSB7IHJldHVybiAoZWxlbS5pZCA9PT0gdGhhdC5faW5zdGFsbGVkQXBwc1tpXS5pZCk7IH0pKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnNldFRva2VuKG51bGwpO1xuICAgICAgICB0aGlzLl91c2VySW5mbyA9IHt9O1xuXG4gICAgICAgIC8vIGxvZ291dCBmcm9tIE9BdXRoIHNlc3Npb25cbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL2FwaS92MS9zZXNzaW9uL2xvZ291dCc7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZXhjaGFuZ2VDb2RlRm9yVG9rZW4gPSBmdW5jdGlvbiAoYXV0aENvZGUsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgZ3JhbnRfdHlwZTogJ2F1dGhvcml6YXRpb25fY29kZScsXG4gICAgICAgICAgICBjb2RlOiBhdXRoQ29kZSxcbiAgICAgICAgICAgIHJlZGlyZWN0X3VyaTogd2luZG93LmxvY2F0aW9uLm9yaWdpbixcbiAgICAgICAgICAgIGNsaWVudF9pZDogdGhpcy5fY2xpZW50SWQsXG4gICAgICAgICAgICBjbGllbnRfc2VjcmV0OiB0aGlzLl9jbGllbnRTZWNyZXRcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL29hdXRoL3Rva2VuP3Jlc3BvbnNlX3R5cGU9dG9rZW4mY2xpZW50X2lkPScgKyB0aGlzLl9jbGllbnRJZCwgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYWNjZXNzX3Rva2VuKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBjbGllbnQgPSBuZXcgQ2xpZW50KCk7XG4gICAgcmV0dXJuIGNsaWVudDtcbn0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdBcHBTdG9yZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckbG9jYXRpb24nLCAnQ2xpZW50JywgJ0FwcFN0b3JlJywgZnVuY3Rpb24gKCRzY29wZSwgJGxvY2F0aW9uLCBDbGllbnQsIEFwcFN0b3JlKSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5MT0FESU5HID0gMTtcbiAgICAkc2NvcGUuRVJST1IgPSAyO1xuICAgICRzY29wZS5MT0FERUQgPSAzO1xuXG4gICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuTE9BRElORztcbiAgICAkc2NvcGUubG9hZEVycm9yID0gJyc7XG5cbiAgICAkc2NvcGUuYXBwcyA9IFtdO1xuXG4gICAgJHNjb3BlLnJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIENsaWVudC5yZWZyZXNoSW5zdGFsbGVkQXBwcyhmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkVSUk9SO1xuICAgICAgICAgICAgICAgICRzY29wZS5sb2FkRXJyb3IgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgQXBwU3RvcmUuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuRVJST1I7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5sb2FkRXJyb3IgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgYXBwIGluIGFwcHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgJHNjb3BlLmFwcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhcHBzW2FwcF0uaWQgPT09ICRzY29wZS5hcHBzW2ldLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmb3VuZCkgJHNjb3BlLmFwcHMucHVzaChhcHBzW2FwcF0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICRzY29wZS5hcHBzLmZvckVhY2goZnVuY3Rpb24gKGFwcCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKENsaWVudC5faW5zdGFsbGVkQXBwcykgYXBwLmluc3RhbGxlZCA9IENsaWVudC5faW5zdGFsbGVkQXBwcy5zb21lKGZ1bmN0aW9uIChhKSB7IHJldHVybiBhLmFwcFN0b3JlSWQgPT09IGFwcC5pZDsgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXBwc1thcHAuaWRdKSAkc2NvcGUuYXBwcy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuTE9BREVEO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuaW5zdGFsbEFwcCA9IGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgJGxvY2F0aW9uLnBhdGgoJy9hcHAvJyArIGFwcC5pZCArICcvaW5zdGFsbCcpO1xuICAgIH07XG5cbiAgICAkc2NvcGUub3BlbkFwcCA9IGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBDbGllbnQuX2luc3RhbGxlZEFwcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChDbGllbnQuX2luc3RhbGxlZEFwcHNbaV0uYXBwU3RvcmVJZCA9PT0gYXBwLmlkKSB7XG4gICAgICAgICAgICAgICAgd2luZG93Lm9wZW4oJ2h0dHBzOi8vJyArIENsaWVudC5faW5zdGFsbGVkQXBwc1tpXS5mcWRuKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBDbGllbnQub25Db25maWcoZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICBpZiAoIWNvbmZpZy5hcGlTZXJ2ZXJPcmlnaW4pIHJldHVybjtcbiAgICAgICAgJHNjb3BlLnJlZnJlc2goKTtcbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignTWFpbkNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcm91dGUnLCAnJGludGVydmFsJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZSwgJGludGVydmFsLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUudXNlckluZm8gPSBDbGllbnQuZ2V0VXNlckluZm8oKTtcbiAgICAkc2NvcGUuaW5zdGFsbGVkQXBwcyA9IENsaWVudC5nZXRJbnN0YWxsZWRBcHBzKCk7XG5cbiAgICAkc2NvcGUuaXNBY3RpdmUgPSBmdW5jdGlvbiAodXJsKSB7XG4gICAgICAgIGlmICghJHJvdXRlLmN1cnJlbnQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuICRyb3V0ZS5jdXJyZW50LiQkcm91dGUub3JpZ2luYWxQYXRoLmluZGV4T2YodXJsKSA9PT0gMDtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgJHNjb3BlLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgICAgIENsaWVudC5sb2dvdXQoKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmxvZ2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY2FsbGJhY2tVUkwgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgJy9sb2dpbl9jYWxsYmFjay5odG1sJztcbiAgICAgICAgdmFyIHNjb3BlID0gJ3Jvb3QscHJvZmlsZSxhcHBzLHJvbGVBZG1pbic7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9hcGkvdjEvb2F1dGgvZGlhbG9nL2F1dGhvcml6ZT9yZXNwb25zZV90eXBlPWNvZGUmY2xpZW50X2lkPScgKyBDbGllbnQuX2NsaWVudElkICsgJyZyZWRpcmVjdF91cmk9JyArIGNhbGxiYWNrVVJMICsgJyZzY29wZT0nICsgc2NvcGU7XG4gICAgfTtcblxuICAgICRzY29wZS5zZXR1cCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL3NldHVwLmh0bWwnO1xuICAgIH07XG5cbiAgICAkc2NvcGUuZXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9lcnJvci5odG1sJztcbiAgICB9O1xuXG4gICAgQ2xpZW50LmlzU2VydmVyRmlyc3RUaW1lKGZ1bmN0aW9uIChlcnJvciwgaXNGaXJzdFRpbWUpIHtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcbiAgICAgICAgaWYgKGlzRmlyc3RUaW1lKSByZXR1cm4gJHNjb3BlLnNldHVwKCk7XG5cbiAgICAgICAgLy8gd2UgdXNlIHRoZSBjb25maWcgcmVxdWVzdCBhcyBhbiBpbmRpY2F0b3IgaWYgdGhlIHRva2VuIGlzIHN0aWxsIHZhbGlkXG4gICAgICAgIC8vIFRPRE8gd2Ugc2hvdWxkIHByb2JhYmx5IGF0dGFjaCBzdWNoIGEgaGFuZGxlciBmb3IgZWFjaCByZXF1ZXN0LCBhcyB0aGUgdG9rZW4gY2FuIGdldCBpbnZhbGlkXG4gICAgICAgIC8vIGF0IGFueSB0aW1lIVxuICAgICAgICBpZiAobG9jYWxTdG9yYWdlLnRva2VuKSB7XG4gICAgICAgICAgICBDbGllbnQucmVmcmVzaENvbmZpZyhmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAxKSByZXR1cm4gJHNjb3BlLmxvZ2luKCk7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIHdlIGFyZSBhY3R1YWxseSB1cGRhdGVpbmdcbiAgICAgICAgICAgICAgICBpZiAoQ2xpZW50LmdldENvbmZpZygpLnByb2dyZXNzLnVwZGF0ZSkgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL3VwZGF0ZS5odG1sJztcblxuICAgICAgICAgICAgICAgIENsaWVudC51c2VySW5mbyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiAkc2NvcGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgICAgIENsaWVudC5zZXRVc2VySW5mbyhyZXN1bHQpO1xuXG4gICAgICAgICAgICAgICAgICAgIENsaWVudC5yZWZyZXNoSW5zdGFsbGVkQXBwcyhmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGtpY2sgb2ZmIGluc3RhbGxlZCBhcHBzIGFuZCBjb25maWcgcG9sbGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZnJlc2hBcHBzVGltZXIgPSAkaW50ZXJ2YWwoQ2xpZW50LnJlZnJlc2hJbnN0YWxsZWRBcHBzLmJpbmQoQ2xpZW50KSwgMjAwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVmcmVzaENvbmZpZ1RpbWVyID0gJGludGVydmFsKENsaWVudC5yZWZyZXNoQ29uZmlnLmJpbmQoQ2xpZW50KSwgNTAwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwocmVmcmVzaEFwcHNUaW1lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChyZWZyZXNoQ29uZmlnVGltZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vdyBtYXJrIHRoZSBDbGllbnQgdG8gYmUgcmVhZHlcbiAgICAgICAgICAgICAgICAgICAgICAgIENsaWVudC5zZXRSZWFkeSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJHNjb3BlLmxvZ2luKCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIHdhaXQgdGlsbCB0aGUgdmlldyBoYXMgbG9hZGVkIHVudGlsIHNob3dpbmcgYSBtb2RhbCBkaWFsb2dcbiAgICBDbGllbnQub25Db25maWcoZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICBpZiAoY29uZmlnLnByb2dyZXNzLnVwZGF0ZSkge1xuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL3VwZGF0ZS5odG1sJztcbiAgICAgICAgfVxuICAgIH0pO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdBY2NvdW50Q29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkbG9jYXRpb24sIENsaWVudCkge1xuICAgICRzY29wZS51c2VyID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLmNvbmZpZyA9IENsaWVudC5nZXRDb25maWcoKTtcblxuICAgICRzY29wZS5jaGFuZ2VQYXNzd29yZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJGxvY2F0aW9uLnBhdGgoJy91c2VycGFzc3dvcmQnKTtcbiAgICAgICAgLy8gd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy91c2VycGFzc3dvcmQnO1xuICAgIH07XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0FwcENvbmZpZ3VyZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcm91dGVQYXJhbXMnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZVBhcmFtcywgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLmFwcCA9IG51bGw7XG4gICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLmxvY2F0aW9uID0gJyc7XG4gICAgJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uID0gJyc7XG4gICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgJHNjb3BlLmVycm9yID0ge307XG4gICAgJHNjb3BlLmRvbWFpbiA9ICcnO1xuICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSB7IH07XG5cbiAgICAkc2NvcGUuY29uZmlndXJlQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9IG51bGw7XG4gICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9IG51bGw7XG5cbiAgICAgICAgdmFyIHBvcnRCaW5kaW5ncyA9IHsgfTtcbiAgICAgICAgZm9yICh2YXIgY29udGFpbmVyUG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICBwb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF0gPSAkc2NvcGUucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdLmhvc3RQb3J0O1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50LmNvbmZpZ3VyZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsICRzY29wZS5wYXNzd29yZCwgeyBsb2NhdGlvbjogJHNjb3BlLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IHBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246ICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gJ1dyb25nIHBhc3N3b3JkIHByb3ZpZGVkLic7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5wYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gJ0FwcCB3aXRoIHRoZSBuYW1lICcgKyAkc2NvcGUuYXBwLm5hbWUgKyAnIGNhbm5vdCBiZSBjb25maWd1cmVkLic7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZSgnIy9hcHAvJyArICRyb3V0ZVBhcmFtcy5hcHBJZCArICcvZGV0YWlscycpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS5kb21haW4gPSBDbGllbnQuZ2V0Q29uZmlnKCkuZnFkbjtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yLCBhcHApIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IGVycm9yIHx8IHsgfTtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuO1xuXG4gICAgICAgICAgICAkc2NvcGUuYXBwID0gYXBwO1xuICAgICAgICAgICAgJHNjb3BlLmxvY2F0aW9uID0gYXBwLmxvY2F0aW9uO1xuICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5ncyA9IGFwcC5tYW5pZmVzdC50Y3BQb3J0cztcbiAgICAgICAgICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9IGFwcC5hY2Nlc3NSZXN0cmljdGlvbjtcbiAgICAgICAgICAgIGZvciAodmFyIGNvbnRhaW5lclBvcnQgaW4gJHNjb3BlLnBvcnRCaW5kaW5ncykge1xuICAgICAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF0uaG9zdFBvcnQgPSBhcHAucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dExvY2F0aW9uJykuZm9jdXMoKTtcbn1dKTtcbiIsIi8qIGdsb2JhbCAkOnRydWUgKi9cbi8qIGdsb2JhbCBSaWNrc2hhdzp0cnVlICovXG5cbid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignQXBwRGV0YWlsc0NvbnRyb2xsZXInLCBbJyRzY29wZScsICckaHR0cCcsICckcm91dGVQYXJhbXMnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRodHRwLCAkcm91dGVQYXJhbXMsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5hcHAgPSB7fTtcbiAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUudXBkYXRlQXZhaWxhYmxlID0gZmFsc2U7XG4gICAgJHNjb3BlLmFjdGl2ZVRhYiA9ICdkYXknO1xuXG4gICAgJHNjb3BlLnN0YXJ0QXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQuc3RhcnRBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc3RvcEFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnN0b3BBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUudXBkYXRlQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQudXBkYXRlQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmRlbGV0ZUFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJCgnI2RlbGV0ZUFwcE1vZGFsJykubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICBDbGllbnQucmVtb3ZlQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy8nO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgY3B1RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRDcHUgPSBbIF07XG5cbiAgICAgICAgaWYgKGNwdURhdGEgJiYgY3B1RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZENwdSA9IGNwdURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBjcHVHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdDcHVDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMTAwLFxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZENwdSB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ2NwdSdcbiAgICAgICAgICAgIH1dXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBjcHVYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogY3B1R3JhcGggfSk7XG4gICAgICAgIHZhciBjcHVZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0NwdVlBeGlzJyksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBjcHVIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogY3B1R3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkpLnRvRml4ZWQoMikgKyAnJTxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjcHVHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJNZW1vcnkoYWN0aXZlVGFiLCBtZW1vcnlEYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZE1lbW9yeSA9IFsgXTtcblxuICAgICAgICBpZiAobWVtb3J5RGF0YSAmJiBtZW1vcnlEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkTWVtb3J5ID0gbWVtb3J5RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIG1lbW9yeUdyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ01lbW9yeUNoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAyICogMTAyNCAqIDEwMjQgKiAxMDI0LCAvLyAyZ2JcbiAgICAgICAgICAgIHNlcmllczogWyB7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkTWVtb3J5IHx8IFsgXSxcbiAgICAgICAgICAgICAgICBuYW1lOiAnbWVtb3J5J1xuICAgICAgICAgICAgfSBdXG4gICAgICAgIH0gKTtcblxuICAgICAgICB2YXIgbWVtb3J5WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IG1lbW9yeUdyYXBoIH0pO1xuICAgICAgICB2YXIgbWVtb3J5WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBtZW1vcnlHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdNZW1vcnlZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbWVtb3J5SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IG1lbW9yeUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LygxMDI0KjEwMjQpKS50b0ZpeGVkKDIpICsgJ01CPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1lbW9yeUdyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkaXNrRGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWREaXNrID0gWyBdO1xuXG4gICAgICAgIGlmIChkaXNrRGF0YSAmJiBkaXNrRGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZERpc2sgPSBkaXNrRGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIGRpc2tHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdEaXNrQ2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDMwICogMTAyNCAqIDEwMjQgKiAxMDI0LCAvLyAzMGdiXG4gICAgICAgICAgICBzZXJpZXM6IFt7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkRGlzayB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ2FwcHMnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIGRpc2tYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogZGlza0dyYXBoIH0pO1xuICAgICAgICB2YXIgZGlza1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0Rpc2tZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvKDEwMjQgKiAxMDI0KSkudG9GaXhlZCgyKSArICdNQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0xlZ2VuZCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5MZWdlbmQoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrTGVnZW5kJylcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGlza0dyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgICRzY29wZS51cGRhdGVHcmFwaHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjcHVVc2FnZVRhcmdldCA9XG4gICAgICAgICAgICAnbm9uTmVnYXRpdmVEZXJpdmF0aXZlKCcgK1xuICAgICAgICAgICAgICAgICdzdW1TZXJpZXMoY29sbGVjdGQubG9jYWxob3N0LnRhYmxlLScgKyAkc2NvcGUuYXBwLmlkICsgJy1jcHUuZ2F1Z2UtdXNlciwnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJ2NvbGxlY3RkLmxvY2FsaG9zdC50YWJsZS0nICsgJHNjb3BlLmFwcC5pZCArICctY3B1LmdhdWdlLXN5c3RlbSkpJzsgLy8gYXNzdW1lcyAxMDAgamlmZmllcyBwZXIgc2VjIChVU0VSX0haKVxuXG4gICAgICAgIHZhciBtZW1vcnlVc2FnZVRhcmdldCA9ICdjb2xsZWN0ZC5sb2NhbGhvc3QudGFibGUtJyArICRzY29wZS5hcHAuaWQgKyAnLW1lbW9yeS5nYXVnZS1tYXhfdXNhZ2VfaW5fYnl0ZXMnO1xuXG4gICAgICAgIHZhciBkaXNrVXNhZ2VUYXJnZXQgPSAnY29sbGVjdGQubG9jYWxob3N0LmZpbGVjb3VudC0nICsgJHNjb3BlLmFwcC5pZCArICctYXBwZGF0YS5ieXRlcyc7XG5cbiAgICAgICAgdmFyIGFjdGl2ZVRhYiA9ICRzY29wZS5hY3RpdmVUYWI7XG4gICAgICAgIHZhciBmcm9tID0gJy0yNGhvdXJzJztcbiAgICAgICAgc3dpdGNoIChhY3RpdmVUYWIpIHtcbiAgICAgICAgY2FzZSAnZGF5JzogZnJvbSA9ICctMjRob3Vycyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdtb250aCc6IGZyb20gPSAnLTFtb250aCc7IGJyZWFrO1xuICAgICAgICBjYXNlICd5ZWFyJzogZnJvbSA9ICctMXllYXInOyBicmVhaztcbiAgICAgICAgZGVmYXVsdDogY29uc29sZS5sb2coJ2ludGVybmFsIGVycnJvcicpO1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50LmdyYXBocyhbIGNwdVVzYWdlVGFyZ2V0LCBtZW1vcnlVc2FnZVRhcmdldCwgZGlza1VzYWdlVGFyZ2V0IF0sIGZyb20sIGZ1bmN0aW9uIChlcnJvciwgZGF0YSkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5sb2coZXJyb3IpO1xuXG4gICAgICAgICAgICByZW5kZXJDcHUoYWN0aXZlVGFiLCBkYXRhWzBdKTtcblxuICAgICAgICAgICAgcmVuZGVyTWVtb3J5KGFjdGl2ZVRhYiwgZGF0YVsxXSk7XG5cbiAgICAgICAgICAgIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkYXRhWzJdKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yLCBhcHApIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvJztcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS5hcHAgPSBhcHA7XG4gICAgICAgICAgICAkc2NvcGUuYXBwTG9nVXJsID0gQ2xpZW50LmdldEFwcExvZ1VybChhcHAuaWQpO1xuXG4gICAgICAgICAgICBpZiAoQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZSAmJiBDbGllbnQuZ2V0Q29uZmlnKCkudXBkYXRlLmFwcHMpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUudXBkYXRlQXZhaWxhYmxlID0gQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZS5hcHBzLnNvbWUoZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHguYXBwSWQgPT09ICRzY29wZS5hcHAuYXBwU3RvcmVJZCAmJiB4LnZlcnNpb24gIT09ICRzY29wZS5hcHAudmVyc2lvbjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgJHNjb3BlLnVwZGF0ZUdyYXBocygpO1xuXG4gICAgICAgICAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignQXBwSW5zdGFsbENvbnRyb2xsZXInLCBbJyRzY29wZScsICckcm91dGVQYXJhbXMnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsICdBcHBTdG9yZScsICckdGltZW91dCcsIGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZVBhcmFtcywgJGxvY2F0aW9uLCBDbGllbnQsIEFwcFN0b3JlLCAkdGltZW91dCkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUuYXBwID0gbnVsbDtcbiAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAkc2NvcGUubG9jYXRpb24gPSAnJztcbiAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSAnJztcbiAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUuZXJyb3IgPSB7IH07XG4gICAgJHNjb3BlLmRvbWFpbiA9ICcnO1xuICAgICRzY29wZS52ZXJzaW9uID0gbnVsbDtcbiAgICAkc2NvcGUucG9ydEJpbmRpbmdzID0geyB9O1xuICAgICRzY29wZS5ob3N0UG9ydE1pbiA9IDEwMjU7XG4gICAgJHNjb3BlLmhvc3RQb3J0TWF4ID0gOTk5OTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmRvbWFpbiA9IENsaWVudC5nZXRDb25maWcoKS5mcWRuO1xuXG4gICAgICAgIEFwcFN0b3JlLmdldEFwcEJ5SWQoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcbiAgICAgICAgICAgICRzY29wZS5hcHAgPSBhcHA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFwcFN0b3JlLmdldE1hbmlmZXN0KCRyb3V0ZVBhcmFtcy5hcHBTdG9yZUlkLCBmdW5jdGlvbiAoZXJyb3IsIG1hbmlmZXN0KSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcbiAgICAgICAgICAgICRzY29wZS52ZXJzaW9uID0gbWFuaWZlc3QudmVyc2lvbjtcbiAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSBtYW5pZmVzdC50Y3BQb3J0cztcbiAgICAgICAgICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9IG1hbmlmZXN0LmFjY2Vzc1Jlc3RyaWN0aW9uIHx8ICcnO1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBzZXR0aW5nIGlzIHRvIG1hcCBwb3J0cyBhcyB0aGV5IGFyZSBpbiBtYW5pZmVzdFxuICAgICAgICAgICAgZm9yICh2YXIgcG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5nc1twb3J0XS5ob3N0UG9ydCA9IHBhcnNlSW50KHBvcnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgICRzY29wZS5pbnN0YWxsQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9IG51bGw7XG4gICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9IG51bGw7XG5cbiAgICAgICAgdmFyIHBvcnRCaW5kaW5ncyA9IHsgfTtcbiAgICAgICAgZm9yICh2YXIgcG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICBwb3J0QmluZGluZ3NbcG9ydF0gPSAkc2NvcGUucG9ydEJpbmRpbmdzW3BvcnRdLmhvc3RQb3J0O1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50Lmluc3RhbGxBcHAoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsICRzY29wZS52ZXJzaW9uLCAkc2NvcGUucGFzc3dvcmQsICRzY29wZS5hcHAudGl0bGUsIHsgbG9jYXRpb246ICRzY29wZS5sb2NhdGlvbiwgcG9ydEJpbmRpbmdzOiBwb3J0QmluZGluZ3MsIGFjY2Vzc1Jlc3RyaWN0aW9uOiAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gfSwgZnVuY3Rpb24gKGVycm9yLCBhcHBJZCkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yLnN0YXR1c0NvZGUgPT09IDQwOSkge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9ICdBcHBsaWNhdGlvbiBhbHJlYWR5IGV4aXN0cy4nO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAzKSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9ICdXcm9uZyBwYXNzd29yZCBwcm92aWRlZC4nO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9ICdBcHAgd2l0aCB0aGUgbmFtZSAnICsgJHNjb3BlLmFwcC5uYW1lICsgJyBjYW5ub3QgYmUgaW5zdGFsbGVkLic7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZSgnIy9hcHAvJyArIGFwcElkICsgJy9kZXRhaWxzJyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcblxuICAgIC8vIGhhY2sgZm9yIGF1dG9mb2N1cyB3aXRoIGFuZ3VsYXJcbiAgICAkc2NvcGUuJG9uKCckdmlld0NvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICR0aW1lb3V0KGZ1bmN0aW9uICgpIHsgJCgnaW5wdXRbYXV0b2ZvY3VzXTp2aXNpYmxlOmZpcnN0JykuZm9jdXMoKTsgfSwgMTAwMCk7XG4gICAgfSk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0Rhc2hib2FyZENvbnRyb2xsZXInLCBmdW5jdGlvbiAoKSB7XG5cbn0pO1xuIiwiLyogZ2xvYmFsOlJpY2tzaGF3OnRydWUgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdHcmFwaHNDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5hY3RpdmVUYWIgPSAnZGF5JztcblxuICAgIHZhciBjcHVVc2FnZVRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKCcgK1xuICAgICdzY2FsZShkaXZpZGVTZXJpZXMoJyArXG4gICAgICAgICdzdW1TZXJpZXMoY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1zeXN0ZW0sY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1uaWNlLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtdXNlciksJyArXG4gICAgICAgICdzdW1TZXJpZXMoY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1pZGxlLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtc3lzdGVtLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtbmljZSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXVzZXIsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS13YWl0KSksIDEwMCksIDApJztcblxuICAgIHZhciBuZXR3b3JrVXNhZ2VUeFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5pbnRlcmZhY2UtZXRoMC5pZl9vY3RldHMudHgsIDApJztcbiAgICB2YXIgbmV0d29ya1VzYWdlUnhUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuaW50ZXJmYWNlLWV0aDAuaWZfb2N0ZXRzLnJ4LCAwKSc7XG5cbiAgICB2YXIgZGlza1VzYWdlQXBwc1VzZWRUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuZGYtbG9vcDAuZGZfY29tcGxleC11c2VkLCAwKSc7XG4gICAgdmFyIGRpc2tVc2FnZURhdGFVc2VkVGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoY29sbGVjdGQubG9jYWxob3N0LmRmLWxvb3AxLmRmX2NvbXBsZXgtdXNlZCwgMCknO1xuXG4gICAgZnVuY3Rpb24gcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgY3B1RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRDcHUgPSBbIF07XG5cbiAgICAgICAgaWYgKGNwdURhdGEgJiYgY3B1RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZENwdSA9IGNwdURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBjcHVHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdDcHVDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMTAwLFxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZENwdSxcbiAgICAgICAgICAgICAgICBuYW1lOiAnY3B1J1xuICAgICAgICAgICAgfV1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGNwdVhBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBjcHVHcmFwaCB9KTtcbiAgICAgICAgdmFyIGNwdVlBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogY3B1R3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnQ3B1WUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGNwdUhvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeSkudG9GaXhlZCgyKSArICclPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNwdUdyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbmRlck5ldHdvcmsoYWN0aXZlVGFiLCB0eERhdGEsIHJ4RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRUeCA9IFsgXSwgdHJhbnNmb3JtZWRSeCA9IFsgXTtcblxuICAgICAgICBpZiAodHhEYXRhICYmIHR4RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZFR4ID0gdHhEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcbiAgICAgICAgaWYgKHJ4RGF0YSAmJiByeERhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRSeCA9IHJ4RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIG5ldHdvcmtHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdOZXR3b3JrQ2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBzZXJpZXM6IFsge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZFR4LFxuICAgICAgICAgICAgICAgIG5hbWU6ICd0eCdcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBjb2xvcjogJ2dyZWVuJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZFJ4LFxuICAgICAgICAgICAgICAgIG5hbWU6ICdyeCdcbiAgICAgICAgICAgIH0gXVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIG5ldHdvcmtYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogbmV0d29ya0dyYXBoIH0pO1xuICAgICAgICB2YXIgbmV0d29ya1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogbmV0d29ya0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ05ldHdvcmtZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbmV0d29ya0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBuZXR3b3JrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvMTAyNCkudG9GaXhlZCgyKSArICdLQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBuZXR3b3JrR3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyRGlzayhhY3RpdmVUYWIsIGFwcHNVc2VkRGF0YSwgZGF0YVVzZWREYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZEFwcHNVc2VkID0gWyBdLCB0cmFuc2Zvcm1lZERhdGFVc2VkID0gWyBdO1xuXG4gICAgICAgIGlmIChhcHBzVXNlZERhdGEgJiYgYXBwc1VzZWREYXRhLmRhdGFwb2ludHMpIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybWVkQXBwc1VzZWQgPSBhcHBzVXNlZERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9OyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkYXRhVXNlZERhdGEgJiYgZGF0YVVzZWREYXRhLmRhdGFwb2ludHMpIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybWVkRGF0YVVzZWQgPSBkYXRhVXNlZERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9OyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkaXNrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnRGlza0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAzMCAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMzBnYlxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZEFwcHNVc2VkLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBzJ1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JlZW4nLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkRGF0YVVzZWQsXG4gICAgICAgICAgICAgICAgbmFtZTogJ2RhdGEnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIGRpc2tYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogZGlza0dyYXBoIH0pO1xuICAgICAgICB2YXIgZGlza1lBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0Rpc2tZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0hvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkvKDEwMjQgKiAxMDI0ICogMTAyNCkpLnRvRml4ZWQoMikgKyAnR0I8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tMZWdlbmQgPSBuZXcgUmlja3NoYXcuR3JhcGguTGVnZW5kKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza0xlZ2VuZCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRpc2tHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAkc2NvcGUudXBkYXRlR3JhcGhzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYWN0aXZlVGFiID0gJHNjb3BlLmFjdGl2ZVRhYjtcbiAgICAgICB2YXIgZnJvbSA9ICctMjRob3Vycyc7XG4gICAgICAgIHN3aXRjaCAoYWN0aXZlVGFiKSB7XG4gICAgICAgIGNhc2UgJ2RheSc6IGZyb20gPSAnLTI0aG91cnMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnbW9udGgnOiBmcm9tID0gJy0xbW9udGgnOyBicmVhaztcbiAgICAgICAgY2FzZSAneWVhcic6IGZyb20gPSAnLTF5ZWFyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUubG9nKCdpbnRlcm5hbCBlcnJyb3InKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5ncmFwaHMoWyBjcHVVc2FnZVRhcmdldCwgbmV0d29ya1VzYWdlVHhUYXJnZXQsIG5ldHdvcmtVc2FnZVJ4VGFyZ2V0LCBkaXNrVXNhZ2VBcHBzVXNlZFRhcmdldCwgZGlza1VzYWdlRGF0YVVzZWRUYXJnZXQgXSwgZnJvbSwgZnVuY3Rpb24gKGVycm9yLCBkYXRhKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmxvZyhlcnJvcik7XG5cbiAgICAgICAgICAgIHJlbmRlckNwdShhY3RpdmVUYWIsIGRhdGFbMF0pO1xuXG4gICAgICAgICAgICByZW5kZXJOZXR3b3JrKGFjdGl2ZVRhYiwgZGF0YVsxXSwgZGF0YVsyXSk7XG5cbiAgICAgICAgICAgIHJlbmRlckRpc2soYWN0aXZlVGFiLCBkYXRhWzNdLCBkYXRhWzRdKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KCRzY29wZS51cGRhdGVHcmFwaHMpO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdTZWN1cml0eUNvbnRyb2xsZXInLCBbJyRzY29wZScsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCBDbGllbnQpIHtcbiAgICAkc2NvcGUuYWN0aXZlQ2xpZW50cyA9IFtdO1xuICAgICRzY29wZS50b2tlbkluVXNlID0gbnVsbDtcblxuICAgICRzY29wZS5yZW1vdmVBY2Nlc3NUb2tlbnMgPSBmdW5jdGlvbiAoY2xpZW50LCBldmVudCkge1xuICAgICAgICBjbGllbnQuX2J1c3kgPSB0cnVlO1xuXG4gICAgICAgIENsaWVudC5kZWxUb2tlbnNCeUNsaWVudElkKGNsaWVudC5pZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICQoZXZlbnQudGFyZ2V0KS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICAgICAgICAgIGNsaWVudC5fYnVzeSA9IGZhbHNlO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUudG9rZW5JblVzZSA9IENsaWVudC5fdG9rZW47XG5cbiAgICAgICAgQ2xpZW50LmdldE9BdXRoQ2xpZW50cyhmdW5jdGlvbiAoZXJyb3IsIGFjdGl2ZUNsaWVudHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAkc2NvcGUuYWN0aXZlQ2xpZW50cyA9IGFjdGl2ZUNsaWVudHM7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdTZXR0aW5nc0NvbnRyb2xsZXInLCBbJyRzY29wZScsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLnVzZXIgPSBDbGllbnQuZ2V0VXNlckluZm8oKTtcbiAgICAkc2NvcGUuY29uZmlnID0gQ2xpZW50LmdldENvbmZpZygpO1xuICAgICRzY29wZS5uYWtlZERvbWFpbkFwcCA9IG51bGw7XG4gICAgJHNjb3BlLmRyaXZlcyA9IFtdO1xuICAgICRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUgPSBudWxsO1xuICAgICRzY29wZS5jZXJ0aWZpY2F0ZUZpbGVOYW1lID0gJyc7XG4gICAgJHNjb3BlLmtleUZpbGUgPSBudWxsO1xuICAgICRzY29wZS5rZXlGaWxlTmFtZSA9ICcnO1xuXG4gICAgJHNjb3BlLnNldE5ha2VkRG9tYWluID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYXBwaWQgPSAkc2NvcGUubmFrZWREb21haW5BcHAgPyAkc2NvcGUubmFrZWREb21haW5BcHAuaWQgOiAnYWRtaW4nO1xuXG4gICAgICAgIENsaWVudC5zZXROYWtlZERvbWFpbihhcHBpZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKCdFcnJvciBzZXR0aW5nIG5ha2VkIGRvbWFpbicsIGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5iYWNrdXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNiYWNrdXBQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcbiAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBDbGllbnQuYmFja3VwKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gbm93IHN0YXJ0IHF1ZXJ5XG4gICAgICAgICAgICBmdW5jdGlvbiBjaGVja0lmRG9uZSgpIHtcbiAgICAgICAgICAgICAgICBDbGllbnQudmVyc2lvbihmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDEwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICQoJyNiYWNrdXBQcm9ncmVzc01vZGFsJykubW9kYWwoJ2hpZGUnKTtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgNTAwMCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUucmVib290ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkKCcjcmVib290TW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuICAgICAgICAkKCcjcmVib290UHJvZ3Jlc3NNb2RhbCcpLm1vZGFsKCdzaG93Jyk7XG4gICAgICAgICRzY29wZS4kcGFyZW50LmluaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgQ2xpZW50LnJlYm9vdChmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIC8vIG5vdyBzdGFydCBxdWVyeVxuICAgICAgICAgICAgZnVuY3Rpb24gY2hlY2tJZkRvbmUoKSB7XG4gICAgICAgICAgICAgICAgQ2xpZW50LnZlcnNpb24oZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCAxMDAwKTtcblxuICAgICAgICAgICAgICAgICAgICAkKCcjcmVib290UHJvZ3Jlc3NNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQod2luZG93LmxvY2F0aW9uLnJlbG9hZC5iaW5kKHdpbmRvdy5sb2NhdGlvbiwgdHJ1ZSksIDEwMDApO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgNTAwMCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUudXBkYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkKCcjdXBkYXRlTW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuXG4gICAgICAgICRzY29wZS4kcGFyZW50LmluaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgQ2xpZW50LnVwZGF0ZShmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy91cGRhdGUuaHRtbCc7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWRDZXJ0aWZpY2F0ZScpLm9uY2hhbmdlID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICRzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmNlcnRpZmljYXRlRmlsZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXTtcbiAgICAgICAgICAgICRzY29wZS5jZXJ0aWZpY2F0ZUZpbGVOYW1lID0gZXZlbnQudGFyZ2V0LmZpbGVzWzBdLm5hbWU7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWRLZXknKS5vbmNoYW5nZSA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAkc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5rZXlGaWxlID0gZXZlbnQudGFyZ2V0LmZpbGVzWzBdO1xuICAgICAgICAgICAgJHNjb3BlLmtleUZpbGVOYW1lID0gZXZlbnQudGFyZ2V0LmZpbGVzWzBdLm5hbWU7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2V0Q2VydGlmaWNhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdXaWxsIHNldCB0aGUgY2VydGlmaWNhdGUnKTtcblxuICAgICAgICBpZiAoISRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUpIHJldHVybiBjb25zb2xlLmxvZygnQ2VydGlmaWNhdGUgbm90IHNldCcpO1xuICAgICAgICBpZiAoISRzY29wZS5rZXlGaWxlKSByZXR1cm4gY29uc29sZS5sb2coJ0tleSBub3Qgc2V0Jyk7XG5cbiAgICAgICAgQ2xpZW50LnNldENlcnRpZmljYXRlKCRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUsICRzY29wZS5rZXlGaWxlLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUubG9nKGVycm9yKTtcblxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQod2luZG93LmxvY2F0aW9uLnJlbG9hZC5iaW5kKHdpbmRvdy5sb2NhdGlvbiwgdHJ1ZSksIDMwMDApO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uQ29uZmlnKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLnRva2VuSW5Vc2UgPSBDbGllbnQuX3Rva2VuO1xuXG4gICAgICAgIENsaWVudC5nZXRBcHBzKGZ1bmN0aW9uIChlcnJvciwgYXBwcykge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIGFwcCBsaXN0Jyk7XG4gICAgICAgICAgICAkc2NvcGUuYXBwcyA9IGFwcHM7XG5cbiAgICAgICAgICAgIENsaWVudC5nZXROYWtlZERvbWFpbihmdW5jdGlvbiAoZXJyb3IsIGFwcGlkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUubmFrZWREb21haW5BcHAgPSBudWxsO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgJHNjb3BlLmFwcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCRzY29wZS5hcHBzW2ldLmlkID09PSBhcHBpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgJHNjb3BlLm5ha2VkRG9tYWluQXBwID0gJHNjb3BlLmFwcHNbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBDbGllbnQuc3RhdHMoZnVuY3Rpb24gKGVycm9yLCBzdGF0cykge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmRyaXZlcyA9IHN0YXRzLmRyaXZlcztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignVXNlckNyZWF0ZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcm91dGVQYXJhbXMnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZVBhcmFtcywgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG5cbiAgICAkc2NvcGUudXNlcm5hbWUgPSAnJztcbiAgICAkc2NvcGUuZW1haWwgPSAnJztcbiAgICAkc2NvcGUuYWxyZWFkeVRha2VuID0gJyc7XG5cbiAgICAkc2NvcGUuc3VibWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuYWxyZWFkeVRha2VuID0gJyc7XG5cbiAgICAgICAgJHNjb3BlLmRpc2FibGVkID0gdHJ1ZTtcblxuICAgICAgICBDbGllbnQuY3JlYXRlVXNlcigkc2NvcGUudXNlcm5hbWUsICRzY29wZS5lbWFpbCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDA5KSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmFscmVhZHlUYWtlbiA9ICRzY29wZS51c2VybmFtZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignVXNlcm5hbWUgYWxyZWFkeSB0YWtlbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gY3JlYXRlIHVzZXIuJywgZXJyb3IpO1xuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjL3VzZXJsaXN0JztcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdVc2VyTGlzdENvbnRyb2xsZXInLCBbJyRzY29wZScsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLnJlYWR5ID0gZmFsc2U7XG4gICAgJHNjb3BlLnVzZXJzID0gW107XG4gICAgJHNjb3BlLnVzZXJJbmZvID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLnVzZXJEZWxldGVGb3JtID0ge1xuICAgICAgICB1c2VybmFtZTogJycsXG4gICAgICAgIHBhc3N3b3JkOiAnJ1xuICAgIH07XG5cbiAgICAkc2NvcGUuaXNNZSA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiB1c2VyLnVzZXJuYW1lID09PSBDbGllbnQuZ2V0VXNlckluZm8oKS51c2VybmFtZTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmlzQWRtaW4gPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gISF1c2VyLmFkbWluO1xuICAgIH07XG5cbiAgICAkc2NvcGUudG9nZ2xlQWRtaW4gPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICBDbGllbnQuc2V0QWRtaW4odXNlci51c2VybmFtZSwgIXVzZXIuYWRtaW4sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIHVzZXIuYWRtaW4gPSAhdXNlci5hZG1pbjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5kZWxldGVVc2VyID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgLy8gVE9ETyBhZGQgYnVzeSBpbmRpY2F0b3IgYW5kIGJsb2NrIGZvcm1cbiAgICAgICAgaWYgKCRzY29wZS51c2VyRGVsZXRlRm9ybS51c2VybmFtZSAhPT0gdXNlci51c2VybmFtZSkgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VzZXJuYW1lIGRvZXMgbm90IG1hdGNoJyk7XG5cbiAgICAgICAgQ2xpZW50LnJlbW92ZVVzZXIodXNlci51c2VybmFtZSwgJHNjb3BlLnVzZXJEZWxldGVGb3JtLnBhc3N3b3JkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDEpIHJldHVybiBjb25zb2xlLmVycm9yKCdXcm9uZyBwYXNzd29yZCcpO1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGRlbGV0ZSB1c2VyLicsIGVycm9yKTtcblxuICAgICAgICAgICAgJCgnI3VzZXJEZWxldGVNb2RhbC0nICsgdXNlci51c2VybmFtZSkubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAgICAgcmVmcmVzaCgpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcmVmcmVzaCgpIHtcbiAgICAgICAgQ2xpZW50Lmxpc3RVc2VycyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGdldCB1c2VyIGxpc3RpbmcuJywgZXJyb3IpO1xuXG4gICAgICAgICAgICAkc2NvcGUudXNlcnMgPSByZXN1bHQudXNlcnM7XG4gICAgICAgICAgICAkc2NvcGUucmVhZHkgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAkc2NvcGUuYWRkVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy91c2VyY3JlYXRlJztcbiAgICB9O1xuXG4gICAgcmVmcmVzaCgpO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdVc2VyUGFzc3dvcmRDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGVQYXJhbXMsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAkc2NvcGUuY3VycmVudFBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLm5ld1Bhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLnJlcGVhdFBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcyA9IHt9O1xuXG4gICAgJHNjb3BlLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5jdXJyZW50UGFzc3dvcmQgPSAnJztcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5uZXdQYXNzd29yZCA9ICcnO1xuICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLnJlcGVhdFBhc3N3b3JkID0gJyc7XG5cbiAgICAgICAgaWYgKCRzY29wZS5uZXdQYXNzd29yZCAhPT0gJHNjb3BlLnJlcGVhdFBhc3N3b3JkKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRSZXBlYXRQYXNzd29yZCcpLmZvY3VzKCk7XG4gICAgICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLnJlcGVhdFBhc3N3b3JkID0gJ2hhcy1lcnJvcic7XG4gICAgICAgICAgICAkc2NvcGUucmVwZWF0UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgICRzY29wZS5hY3RpdmUgPSB0cnVlO1xuICAgICAgICBDbGllbnQuY2hhbmdlUGFzc3dvcmQoJHNjb3BlLmN1cnJlbnRQYXNzd29yZCwgJHNjb3BlLm5ld1Bhc3N3b3JkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRDdXJyZW50UGFzc3dvcmQnKS5mb2N1cygpO1xuICAgICAgICAgICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MuY3VycmVudFBhc3N3b3JkID0gJ2hhcy1lcnJvcic7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmN1cnJlbnRQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgICRzY29wZS5uZXdQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgICRzY29wZS5yZXBlYXRQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBjaGFuZ2UgcGFzc3dvcmQuJywgZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0Q3VycmVudFBhc3N3b3JkJykuZm9jdXMoKTtcbn1dKTtcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==