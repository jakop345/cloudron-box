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

    Client.prototype.updateApp = function (id, version, callback) {
        $http.post('/api/v1/apps/' + id + '/update', { version: version }).success(function (data, status) {
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
    $scope.updateVersion = null;

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
        Client.updateApp($routeParams.appId, $scope.updateVersion, function (error) {
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
                var appUpdates = Client.getConfig().update.apps;
                for (var i = 0; i < appUpdates.length; i++) {
                    if (appUpdates[i].appId === $scope.app.appStoreId && appUpdates[i].version !==  $scope.app.version) {
                        $scope.updateAvailable = true;
                        $scope.updateVersion = appUpdates[i].version;
                    }
                }
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

        // TODO: this should be based on boxVersion
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIiwiY2xpZW50LmpzIiwiYXBwc3RvcmUuanMiLCJtYWluLmpzIiwiYWNjb3VudC5qcyIsImFwcGNvbmZpZ3VyZS5qcyIsImFwcGRldGFpbHMuanMiLCJhcHBpbnN0YWxsLmpzIiwiZGFzaGJvYXJkLmpzIiwiZ3JhcGhzLmpzIiwic2VjdXJpdHkuanMiLCJzZXR0aW5ncy5qcyIsInVzZXJjcmVhdGUuanMiLCJ1c2VybGlzdC5qcyIsInVzZXJwYXNzd29yZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN4ZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzdOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUw3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QU1yRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuLyogZ2xvYmFsIGFuZ3VsYXI6ZmFsc2UgKi9cblxuLy8gY3JlYXRlIG1haW4gYXBwbGljYXRpb24gbW9kdWxlXG52YXIgYXBwID0gYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJywgWyduZ1JvdXRlJywgJ25nQW5pbWF0ZScsICdhbmd1bGFyLW1kNSddKTtcblxuLy8gc2V0dXAgYWxsIG1ham9yIGFwcGxpY2F0aW9uIHJvdXRlc1xuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHJvdXRlUHJvdmlkZXIpIHtcbiAgICAkcm91dGVQcm92aWRlci53aGVuKCcvJywge1xuICAgICAgICByZWRpcmVjdFRvOiAnL2Rhc2hib2FyZCdcbiAgICB9KS53aGVuKCcvZGFzaGJvYXJkJywge1xuICAgICAgICBjb250cm9sbGVyOiAnRGFzaGJvYXJkQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvZGFzaGJvYXJkLmh0bWwnXG4gICAgfSkud2hlbignL3VzZXJjcmVhdGUnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdVc2VyQ3JlYXRlQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvdXNlcmNyZWF0ZS5odG1sJ1xuICAgIH0pLndoZW4oJy91c2VycGFzc3dvcmQnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdVc2VyUGFzc3dvcmRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy91c2VycGFzc3dvcmQuaHRtbCdcbiAgICB9KS53aGVuKCcvdXNlcmxpc3QnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdVc2VyTGlzdENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3VzZXJsaXN0Lmh0bWwnXG4gICAgfSkud2hlbignL2FwcHN0b3JlJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwU3RvcmVDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBzdG9yZS5odG1sJ1xuICAgIH0pLndoZW4oJy9hcHAvOmFwcFN0b3JlSWQvaW5zdGFsbCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FwcEluc3RhbGxDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBpbnN0YWxsLmh0bWwnXG4gICAgfSkud2hlbignL2FwcC86YXBwSWQvY29uZmlndXJlJywge1xuICAgICAgICBjb250cm9sbGVyOiAnQXBwQ29uZmlndXJlQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvYXBwY29uZmlndXJlLmh0bWwnXG4gICAgfSkud2hlbignL2FwcC86YXBwSWQvZGV0YWlscycsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FwcERldGFpbHNDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hcHBkZXRhaWxzLmh0bWwnXG4gICAgfSkud2hlbignL3NldHRpbmdzJywge1xuICAgICAgICBjb250cm9sbGVyOiAnU2V0dGluZ3NDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9zZXR0aW5ncy5odG1sJ1xuICAgIH0pLndoZW4oJy9hY2NvdW50Jywge1xuICAgICAgICBjb250cm9sbGVyOiAnQWNjb3VudENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FjY291bnQuaHRtbCdcbiAgICB9KS53aGVuKCcvZ3JhcGhzJywge1xuICAgICAgICBjb250cm9sbGVyOiAnR3JhcGhzQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvZ3JhcGhzLmh0bWwnXG4gICAgfSkud2hlbignL3NlY3VyaXR5Jywge1xuICAgICAgICBjb250cm9sbGVyOiAnU2VjdXJpdHlDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9zZWN1cml0eS5odG1sJ1xuICAgIH0pLm90aGVyd2lzZSh7IHJlZGlyZWN0VG86ICcvJ30pO1xufSk7XG5cbmFwcC5maWx0ZXIoJ2luc3RhbGxhdGlvbkFjdGl2ZScsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBmdW5jdGlvbihpbnB1dCkge1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdlcnJvcicpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnaW5zdGFsbGVkJykgcmV0dXJuIGZhbHNlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xufSk7XG5cbmFwcC5maWx0ZXIoJ2luc3RhbGxhdGlvblN0YXRlTGFiZWwnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZXJyb3InKSByZXR1cm4gJ0Vycm9yJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnc3ViZG9tYWluX2Vycm9yJykgcmV0dXJuICdFcnJvcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2luc3RhbGxlZCcpIHJldHVybiAnSW5zdGFsbGVkJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZG93bmxvYWRpbmdfaW1hZ2UnKSByZXR1cm4gJ0Rvd25sb2FkaW5nJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncGVuZGluZ19pbnN0YWxsJykgcmV0dXJuICdJbnN0YWxsaW5nJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncGVuZGluZ191bmluc3RhbGwnKSByZXR1cm4gJ1VuaW5zdGFsbGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2NyZWF0aW5nX2NvbnRhaW5lcicpIHJldHVybiAnQ29udGFpbmVyJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZG93bmxvYWRpbmdfbWFuaWZlc3QnKSByZXR1cm4gJ01hbmlmZXN0JztcbiAgICAgICAgaWYgKGlucHV0ID09PSAnY3JlYXRpbmdfdm9sdW1lJykgcmV0dXJuICdWb2x1bWUnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyZWdpc3RlcmluZ19zdWJkb21haW4nKSByZXR1cm4gJ1N1YmRvbWFpbic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2FsbG9jYXRlZF9vYXV0aF9jcmVkZW50aWFscycpIHJldHVybiAnT0F1dGgnO1xuXG4gICAgICAgIHJldHVybiBpbnB1dDtcbiAgICB9O1xufSk7XG5cbmFwcC5maWx0ZXIoJ2FjY2Vzc1Jlc3RyaWN0aW9uTGFiZWwnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnJykgcmV0dXJuICdwdWJsaWMnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyb2xlVXNlcicpIHJldHVybiAncHJpdmF0ZSc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3JvbGVBZG1pbicpIHJldHVybiAncHJpdmF0ZSAoQWRtaW5zIG9ubHkpJztcblxuICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgfTtcbn0pO1xuXG4vLyBjdXN0b20gZGlyZWN0aXZlIGZvciBkeW5hbWljIG5hbWVzIGluIGZvcm1zXG4vLyBTZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8yMzYxNjU3OC9pc3N1ZS1yZWdpc3RlcmluZy1mb3JtLWNvbnRyb2wtd2l0aC1pbnRlcnBvbGF0ZWQtbmFtZSNhbnN3ZXItMjM2MTc0MDFcbmFwcC5kaXJlY3RpdmUoJ2xhdGVyTmFtZScsIGZ1bmN0aW9uICgpIHsgICAgICAgICAgICAgICAgICAgLy8gKDIpXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgICAgcmVxdWlyZTogWyc/bmdNb2RlbCcsICdeP2Zvcm0nXSwgICAgICAgICAgICAgICAgICAgLy8gKDMpXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIHBvc3RMaW5rKHNjb3BlLCBlbGVtLCBhdHRycywgY3RybHMpIHtcbiAgICAgICAgICAgIGF0dHJzLiRzZXQoJ25hbWUnLCBhdHRycy5sYXRlck5hbWUpO1xuXG4gICAgICAgICAgICB2YXIgbW9kZWxDdHJsID0gY3RybHNbMF07ICAgICAgICAgICAgICAgICAgICAgIC8vICgzKVxuICAgICAgICAgICAgdmFyIGZvcm1DdHJsICA9IGN0cmxzWzFdOyAgICAgICAgICAgICAgICAgICAgICAvLyAoMylcbiAgICAgICAgICAgIGlmIChtb2RlbEN0cmwgJiYgZm9ybUN0cmwpIHtcbiAgICAgICAgICAgICAgICBtb2RlbEN0cmwuJG5hbWUgPSBhdHRycy5uYW1lOyAgICAgICAgICAgICAgLy8gKDQpXG4gICAgICAgICAgICAgICAgZm9ybUN0cmwuJGFkZENvbnRyb2wobW9kZWxDdHJsKTsgICAgICAgICAgIC8vICgyKVxuICAgICAgICAgICAgICAgIHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcm1DdHJsLiRyZW1vdmVDb250cm9sKG1vZGVsQ3RybCk7ICAgIC8vICg1KVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbn0pOyIsIid1c2Ugc3RyaWN0JztcblxuLyogZ2xvYmFsIGFuZ3VsYXIgKi9cbi8qIGdsb2JhbCBFdmVudFNvdXJjZSAqL1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5zZXJ2aWNlKCdDbGllbnQnLCBmdW5jdGlvbiAoJGh0dHAsIG1kNSkge1xuICAgIHZhciBjbGllbnQgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gQ2xpZW50RXJyb3Ioc3RhdHVzQ29kZSwgbWVzc2FnZSkge1xuICAgICAgICBFcnJvci5jYWxsKHRoaXMpO1xuICAgICAgICB0aGlzLm5hbWUgPSB0aGlzLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgIHRoaXMuc3RhdHVzQ29kZSA9IHN0YXR1c0NvZGU7XG4gICAgICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZSA9IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gNDAxKSByZXR1cm4gY2xpZW50LmxvZ291dCgpO1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIENsaWVudCgpIHtcbiAgICAgICAgdGhpcy5fcmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY29uZmlnTGlzdGVuZXIgPSBbXTtcbiAgICAgICAgdGhpcy5fcmVhZHlMaXN0ZW5lciA9IFtdO1xuICAgICAgICB0aGlzLl91c2VySW5mbyA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiBudWxsLFxuICAgICAgICAgICAgZW1haWw6IG51bGwsXG4gICAgICAgICAgICBhZG1pbjogZmFsc2VcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl9jbGllbnRJZCA9ICdjaWQtd2ViYWRtaW4nO1xuICAgICAgICB0aGlzLl9jbGllbnRTZWNyZXQgPSAndW51c2VkJztcbiAgICAgICAgdGhpcy5fY29uZmlnID0ge1xuICAgICAgICAgICAgYXBpU2VydmVyT3JpZ2luOiBudWxsLFxuICAgICAgICAgICAgd2ViU2VydmVyT3JpZ2luOiBudWxsLFxuICAgICAgICAgICAgZnFkbjogbnVsbCxcbiAgICAgICAgICAgIGlwOiBudWxsLFxuICAgICAgICAgICAgcmV2aXNpb246IG51bGwsXG4gICAgICAgICAgICB1cGRhdGU6IG51bGwsXG4gICAgICAgICAgICBpc0RldjogZmFsc2UsXG4gICAgICAgICAgICBwcm9ncmVzczoge31cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5faW5zdGFsbGVkQXBwcyA9IFtdO1xuXG4gICAgICAgIHRoaXMuc2V0VG9rZW4obG9jYWxTdG9yYWdlLnRva2VuKTtcbiAgICB9XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFJlYWR5ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5fcmVhZHkpIHJldHVybjtcblxuICAgICAgICB0aGlzLl9yZWFkeSA9IHRydWU7XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLm9uUmVhZHkgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlYWR5KSBjYWxsYmFjaygpO1xuICAgICAgICB0aGlzLl9yZWFkeUxpc3RlbmVyLnB1c2goY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLm9uQ29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyLnB1c2goY2FsbGJhY2spO1xuICAgICAgICBjYWxsYmFjayh0aGlzLl9jb25maWcpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFVzZXJJbmZvID0gZnVuY3Rpb24gKHVzZXJJbmZvKSB7XG4gICAgICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIGFuZ3VsYXIgYmluZGluZ3MgYWxpdmUsIHNldCBlYWNoIHByb3BlcnR5IGluZGl2aWR1YWxseVxuICAgICAgICB0aGlzLl91c2VySW5mby51c2VybmFtZSA9IHVzZXJJbmZvLnVzZXJuYW1lO1xuICAgICAgICB0aGlzLl91c2VySW5mby5lbWFpbCA9IHVzZXJJbmZvLmVtYWlsO1xuICAgICAgICB0aGlzLl91c2VySW5mby5hZG1pbiA9ICEhdXNlckluZm8uYWRtaW47XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvLmdyYXZhdGFyID0gJ2h0dHBzOi8vd3d3LmdyYXZhdGFyLmNvbS9hdmF0YXIvJyArIG1kNS5jcmVhdGVIYXNoKHVzZXJJbmZvLmVtYWlsLnRvTG93ZXJDYXNlKCkpICsgJy5qcGc/cz0yNCZkPW1tJztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRDb25maWcgPSBmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIGFuZ3VsYXIgYmluZGluZ3MgYWxpdmUsIHNldCBlYWNoIHByb3BlcnR5IGluZGl2aWR1YWxseSAoVE9ETzoganVzdCB1c2UgYW5ndWxhci5jb3B5ID8pXG4gICAgICAgIHRoaXMuX2NvbmZpZy5hcGlTZXJ2ZXJPcmlnaW4gPSBjb25maWcuYXBpU2VydmVyT3JpZ2luO1xuICAgICAgICB0aGlzLl9jb25maWcud2ViU2VydmVyT3JpZ2luID0gY29uZmlnLndlYlNlcnZlck9yaWdpbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLnZlcnNpb24gPSBjb25maWcudmVyc2lvbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLmZxZG4gPSBjb25maWcuZnFkbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLmlwID0gY29uZmlnLmlwO1xuICAgICAgICB0aGlzLl9jb25maWcucmV2aXNpb24gPSBjb25maWcucmV2aXNpb247XG4gICAgICAgIHRoaXMuX2NvbmZpZy51cGRhdGUgPSBjb25maWcudXBkYXRlO1xuICAgICAgICB0aGlzLl9jb25maWcuaXNEZXYgPSBjb25maWcuaXNEZXY7XG4gICAgICAgIHRoaXMuX2NvbmZpZy5wcm9ncmVzcyA9IGNvbmZpZy5wcm9ncmVzcztcblxuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy5fY29uZmlnTGlzdGVuZXIuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKHRoYXQuX2NvbmZpZyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEluc3RhbGxlZEFwcHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9pbnN0YWxsZWRBcHBzO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldFVzZXJJbmZvID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fdXNlckluZm87XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0Q29uZmlnID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29uZmlnO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldFRva2VuID0gZnVuY3Rpb24gKHRva2VuKSB7XG4gICAgICAgICRodHRwLmRlZmF1bHRzLmhlYWRlcnMuY29tbW9uLkF1dGhvcml6YXRpb24gPSAnQmVhcmVyICcgKyB0b2tlbjtcbiAgICAgICAgaWYgKCF0b2tlbikgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3Rva2VuJyk7XG4gICAgICAgIGVsc2UgbG9jYWxTdG9yYWdlLnRva2VuID0gdG9rZW47XG4gICAgICAgIHRoaXMuX3Rva2VuID0gdG9rZW47XG4gICAgfTtcblxuICAgIC8qXG4gICAgICogUmVzdCBBUEkgd3JhcHBlcnNcbiAgICAgKi9cbiAgICBDbGllbnQucHJvdG90eXBlLmNvbmZpZyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vY29uZmlnJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVzZXJJbmZvID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9wcm9maWxlJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmluc3RhbGxBcHAgPSBmdW5jdGlvbiAoaWQsIHZlcnNpb24sIHBhc3N3b3JkLCB0aXRsZSwgY29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgIHZhciBkYXRhID0geyBhcHBTdG9yZUlkOiBpZCwgdmVyc2lvbjogdmVyc2lvbiwgcGFzc3dvcmQ6IHBhc3N3b3JkLCBsb2NhdGlvbjogY29uZmlnLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IGNvbmZpZy5wb3J0QmluZGluZ3MsIGFjY2Vzc1Jlc3RyaWN0aW9uOiBjb25maWcuYWNjZXNzUmVzdHJpY3Rpb24gfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzL2luc3RhbGwnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIC8vIHB1dCBuZXcgYXBwIHdpdGggYW1lbmRlZCB0aXRsZSBpbiBjYWNoZVxuICAgICAgICAgICAgZGF0YS5tYW5pZmVzdCA9IHsgdGl0bGU6IHRpdGxlIH07XG4gICAgICAgICAgICB0aGF0Ll9pbnN0YWxsZWRBcHBzLnB1c2goZGF0YSk7XG5cbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuaWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY29uZmlndXJlQXBwID0gZnVuY3Rpb24gKGlkLCBwYXNzd29yZCwgY29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgYXBwSWQ6IGlkLCBwYXNzd29yZDogcGFzc3dvcmQsIGxvY2F0aW9uOiBjb25maWcubG9jYXRpb24sIHBvcnRCaW5kaW5nczogY29uZmlnLnBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246IGNvbmZpZy5hY2Nlc3NSZXN0cmljdGlvbiB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy9jb25maWd1cmUnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudXBkYXRlQXBwID0gZnVuY3Rpb24gKGlkLCB2ZXJzaW9uLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy91cGRhdGUnLCB7IHZlcnNpb246IHZlcnNpb24gfSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnN0YXJ0QXBwID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvc3RhcnQnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc3RvcEFwcCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7IH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL3N0b3AnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudmVyc2lvbiA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vc3RhdHVzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmlzU2VydmVyRmlyc3RUaW1lID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0dXMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsICFkYXRhLmFjdGl2YXRlZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvc2V0dGluZ3MvbmFrZWRfZG9tYWluJylcbiAgICAgICAgLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYXBwaWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0TmFrZWREb21haW4gPSBmdW5jdGlvbiAoYXBwaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvc2V0dGluZ3MvbmFrZWRfZG9tYWluJywgeyBhcHBpZDogYXBwaWQgfSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2FwcHMnKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFwcHMpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwID0gZnVuY3Rpb24gKGFwcElkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgYXBwRm91bmQgPSBudWxsO1xuICAgICAgICB0aGlzLl9pbnN0YWxsZWRBcHBzLnNvbWUoZnVuY3Rpb24gKGFwcCkge1xuICAgICAgICAgICAgaWYgKGFwcC5pZCA9PT0gYXBwSWQpIHtcbiAgICAgICAgICAgICAgICBhcHBGb3VuZCA9IGFwcDtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoYXBwRm91bmQpIHJldHVybiBjYWxsYmFjayhudWxsLCBhcHBGb3VuZCk7XG4gICAgICAgIGVsc2UgcmV0dXJuIGNhbGxiYWNrKG5ldyBFcnJvcignQXBwIG5vdCBmb3VuZCcpKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVBcHAgPSBmdW5jdGlvbiAoYXBwSWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgYXBwSWQgKyAnL3VuaW5zdGFsbCcpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHBMb2dTdHJlYW0gPSBmdW5jdGlvbiAoYXBwSWQpIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IG5ldyBFdmVudFNvdXJjZSgnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvbG9nc3RyZWFtJyk7XG4gICAgICAgIHJldHVybiBzb3VyY2U7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwTG9nVXJsID0gZnVuY3Rpb24gKGFwcElkKSB7XG4gICAgICAgIHJldHVybiAnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvbG9ncz9hY2Nlc3NfdG9rZW49JyArIHRoaXMuX3Rva2VuO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldEFkbWluID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBhZG1pbiwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHBheWxvYWQgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBhZG1pbjogYWRtaW5cbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL3VzZXJzLycgKyB1c2VybmFtZSArICcvYWRtaW4nLCBwYXlsb2FkKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY3JlYXRlQWRtaW4gPSBmdW5jdGlvbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBlbWFpbCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHBheWxvYWQgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICAgICAgICBlbWFpbDogZW1haWxcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9hY3RpdmF0ZScsIHBheWxvYWQpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICB0aGF0LnNldFRva2VuKGRhdGEudG9rZW4pO1xuICAgICAgICAgICAgdGhhdC5zZXRVc2VySW5mbyh7IHVzZXJuYW1lOiB1c2VybmFtZSwgZW1haWw6IGVtYWlsLCBhZG1pbjogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hY3RpdmF0ZWQpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUubGlzdFVzZXJzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS91c2VycycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdGF0cyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vc3RhdHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0T0F1dGhDbGllbnRzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9vYXV0aC9jbGllbnRzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmNsaWVudHMpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZGVsVG9rZW5zQnlDbGllbnRJZCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZGVsZXRlKCcvYXBpL3YxL29hdXRoL2NsaWVudHMvJyArIGlkICsgJy90b2tlbnMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3VwZGF0ZScpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWJvb3QgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3JlYm9vdCcpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5iYWNrdXAgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9iYWNrdXBzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldENlcnRpZmljYXRlID0gZnVuY3Rpb24gKGNlcnRpZmljYXRlRmlsZSwga2V5RmlsZSwgY2FsbGJhY2spIHtcbiAgICAgICAgY29uc29sZS5sb2coJ3dpbGwgc2V0IGNlcnRpZmljYXRlJyk7XG5cbiAgICAgICAgdmFyIGZkID0gbmV3IEZvcm1EYXRhKCk7XG4gICAgICAgIGZkLmFwcGVuZCgnY2VydGlmaWNhdGUnLCBjZXJ0aWZpY2F0ZUZpbGUpO1xuICAgICAgICBmZC5hcHBlbmQoJ2tleScsIGtleUZpbGUpO1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvY2xvdWRyb24vY2VydGlmaWNhdGUnLCBmZCwge1xuICAgICAgICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogdW5kZWZpbmVkIH0sXG4gICAgICAgICAgICB0cmFuc2Zvcm1SZXF1ZXN0OiBhbmd1bGFyLmlkZW50aXR5XG4gICAgICAgIH0pLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdyYXBocyA9IGZ1bmN0aW9uICh0YXJnZXRzLCBmcm9tLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgY29uZmlnID0ge1xuICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0OiB0YXJnZXRzLFxuICAgICAgICAgICAgICAgIGZvcm1hdDogJ2pzb24nLFxuICAgICAgICAgICAgICAgIGZyb206IGZyb21cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vZ3JhcGhzJywgY29uZmlnKS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNyZWF0ZVVzZXIgPSBmdW5jdGlvbiAodXNlcm5hbWUsIGVtYWlsLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIGVtYWlsOiBlbWFpbFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAxIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUucmVtb3ZlVXNlciA9IGZ1bmN0aW9uICh1c2VybmFtZSwgcGFzc3dvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgICAgcGFzc3dvcmQ6IHBhc3N3b3JkXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAoeyBtZXRob2Q6ICdERUxFVEUnLCB1cmw6ICcvYXBpL3YxL3VzZXJzLycgKyB1c2VybmFtZSwgZGF0YTogZGF0YSwgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH19KS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jaGFuZ2VQYXNzd29yZCA9IGZ1bmN0aW9uIChjdXJyZW50UGFzc3dvcmQsIG5ld1Bhc3N3b3JkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIHBhc3N3b3JkOiBjdXJyZW50UGFzc3dvcmQsXG4gICAgICAgICAgICBuZXdQYXNzd29yZDogbmV3UGFzc3dvcmRcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL3VzZXJzLycgKyB0aGlzLl91c2VySW5mby51c2VybmFtZSArICcvcGFzc3dvcmQnLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0IHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUucmVmcmVzaENvbmZpZyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgY2FsbGJhY2sgPSB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IGZ1bmN0aW9uICgpIHt9O1xuXG4gICAgICAgIHRoaXMuY29uZmlnKGZ1bmN0aW9uIChlcnJvciwgcmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjYWxsYmFjayhlcnJvcik7XG5cbiAgICAgICAgICAgIHRoYXQuc2V0Q29uZmlnKHJlc3VsdCk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUucmVmcmVzaEluc3RhbGxlZEFwcHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgICAgIGNhbGxiYWNrID0gdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBmdW5jdGlvbiAoKSB7fTtcblxuICAgICAgICB0aGlzLmdldEFwcHMoZnVuY3Rpb24gKGVycm9yLCBhcHBzKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjYWxsYmFjayhlcnJvcik7XG5cbiAgICAgICAgICAgIC8vIGluc2VydCBvciB1cGRhdGUgbmV3IGFwcHNcbiAgICAgICAgICAgIGFwcHMuZm9yRWFjaChmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZvdW5kID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoYXQuX2luc3RhbGxlZEFwcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoYXQuX2luc3RhbGxlZEFwcHNbaV0uaWQgPT09IGFwcC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSBpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZm91bmQgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGFuZ3VsYXIuY29weShhcHAsIHRoYXQuX2luc3RhbGxlZEFwcHNbZm91bmRdKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGF0Ll9pbnN0YWxsZWRBcHBzLnB1c2goYXBwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gZmlsdGVyIG91dCBvbGQgZW50cmllcywgZ29pbmcgYmFja3dhcmRzIHRvIGFsbG93IHNwbGljaW5nXG4gICAgICAgICAgICBmb3IodmFyIGkgPSB0aGF0Ll9pbnN0YWxsZWRBcHBzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFhcHBzLnNvbWUoZnVuY3Rpb24gKGVsZW0pIHsgcmV0dXJuIChlbGVtLmlkID09PSB0aGF0Ll9pbnN0YWxsZWRBcHBzW2ldLmlkKTsgfSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5faW5zdGFsbGVkQXBwcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuc2V0VG9rZW4obnVsbCk7XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvID0ge307XG5cbiAgICAgICAgLy8gbG9nb3V0IGZyb20gT0F1dGggc2Vzc2lvblxuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvYXBpL3YxL3Nlc3Npb24vbG9nb3V0JztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5leGNoYW5nZUNvZGVGb3JUb2tlbiA9IGZ1bmN0aW9uIChhdXRoQ29kZSwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICBncmFudF90eXBlOiAnYXV0aG9yaXphdGlvbl9jb2RlJyxcbiAgICAgICAgICAgIGNvZGU6IGF1dGhDb2RlLFxuICAgICAgICAgICAgcmVkaXJlY3RfdXJpOiB3aW5kb3cubG9jYXRpb24ub3JpZ2luLFxuICAgICAgICAgICAgY2xpZW50X2lkOiB0aGlzLl9jbGllbnRJZCxcbiAgICAgICAgICAgIGNsaWVudF9zZWNyZXQ6IHRoaXMuX2NsaWVudFNlY3JldFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvb2F1dGgvdG9rZW4/cmVzcG9uc2VfdHlwZT10b2tlbiZjbGllbnRfaWQ9JyArIHRoaXMuX2NsaWVudElkLCBkYXRhKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hY2Nlc3NfdG9rZW4pO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIGNsaWVudCA9IG5ldyBDbGllbnQoKTtcbiAgICByZXR1cm4gY2xpZW50O1xufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0FwcFN0b3JlQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCAnQXBwU3RvcmUnLCBmdW5jdGlvbiAoJHNjb3BlLCAkbG9jYXRpb24sIENsaWVudCwgQXBwU3RvcmUpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLkxPQURJTkcgPSAxO1xuICAgICRzY29wZS5FUlJPUiA9IDI7XG4gICAgJHNjb3BlLkxPQURFRCA9IDM7XG5cbiAgICAkc2NvcGUubG9hZFN0YXR1cyA9ICRzY29wZS5MT0FESU5HO1xuICAgICRzY29wZS5sb2FkRXJyb3IgPSAnJztcblxuICAgICRzY29wZS5hcHBzID0gW107XG5cbiAgICAkc2NvcGUucmVmcmVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnJlZnJlc2hJbnN0YWxsZWRBcHBzKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRTdGF0dXMgPSAkc2NvcGUuRVJST1I7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRFcnJvciA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBBcHBTdG9yZS5nZXRBcHBzKGZ1bmN0aW9uIChlcnJvciwgYXBwcykge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUubG9hZFN0YXR1cyA9ICRzY29wZS5FUlJPUjtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmxvYWRFcnJvciA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBhcHAgaW4gYXBwcykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAkc2NvcGUuYXBwcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFwcHNbYXBwXS5pZCA9PT0gJHNjb3BlLmFwcHNbaV0uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWZvdW5kKSAkc2NvcGUuYXBwcy5wdXNoKGFwcHNbYXBwXSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmFwcHMuZm9yRWFjaChmdW5jdGlvbiAoYXBwLCBpbmRleCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoQ2xpZW50Ll9pbnN0YWxsZWRBcHBzKSBhcHAuaW5zdGFsbGVkID0gQ2xpZW50Ll9pbnN0YWxsZWRBcHBzLnNvbWUoZnVuY3Rpb24gKGEpIHsgcmV0dXJuIGEuYXBwU3RvcmVJZCA9PT0gYXBwLmlkOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhcHBzW2FwcC5pZF0pICRzY29wZS5hcHBzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUubG9hZFN0YXR1cyA9ICRzY29wZS5MT0FERUQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5pbnN0YWxsQXBwID0gZnVuY3Rpb24gKGFwcCkge1xuICAgICAgICAkbG9jYXRpb24ucGF0aCgnL2FwcC8nICsgYXBwLmlkICsgJy9pbnN0YWxsJyk7XG4gICAgfTtcblxuICAgICRzY29wZS5vcGVuQXBwID0gZnVuY3Rpb24gKGFwcCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IENsaWVudC5faW5zdGFsbGVkQXBwcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKENsaWVudC5faW5zdGFsbGVkQXBwc1tpXS5hcHBTdG9yZUlkID09PSBhcHAuaWQpIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cub3BlbignaHR0cHM6Ly8nICsgQ2xpZW50Ll9pbnN0YWxsZWRBcHBzW2ldLmZxZG4pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIENsaWVudC5vbkNvbmZpZyhmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIGlmICghY29uZmlnLmFwaVNlcnZlck9yaWdpbikgcmV0dXJuO1xuICAgICAgICAkc2NvcGUucmVmcmVzaCgpO1xuICAgIH0pO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdNYWluQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRyb3V0ZScsICckaW50ZXJ2YWwnLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJHJvdXRlLCAkaW50ZXJ2YWwsIENsaWVudCkge1xuICAgICRzY29wZS5pbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICRzY29wZS51c2VySW5mbyA9IENsaWVudC5nZXRVc2VySW5mbygpO1xuICAgICRzY29wZS5pbnN0YWxsZWRBcHBzID0gQ2xpZW50LmdldEluc3RhbGxlZEFwcHMoKTtcblxuICAgICRzY29wZS5pc0FjdGl2ZSA9IGZ1bmN0aW9uICh1cmwpIHtcbiAgICAgICAgaWYgKCEkcm91dGUuY3VycmVudCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICByZXR1cm4gJHJvdXRlLmN1cnJlbnQuJCRyb3V0ZS5vcmlnaW5hbFBhdGguaW5kZXhPZih1cmwpID09PSAwO1xuICAgIH07XG5cbiAgICAkc2NvcGUubG9nb3V0ID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAkc2NvcGUuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICAgICAgQ2xpZW50LmxvZ291dCgpO1xuICAgIH07XG5cbiAgICAkc2NvcGUubG9naW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjYWxsYmFja1VSTCA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyAnL2xvZ2luX2NhbGxiYWNrLmh0bWwnO1xuICAgICAgICB2YXIgc2NvcGUgPSAncm9vdCxwcm9maWxlLGFwcHMscm9sZUFkbWluJztcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL2FwaS92MS9vYXV0aC9kaWFsb2cvYXV0aG9yaXplP3Jlc3BvbnNlX3R5cGU9Y29kZSZjbGllbnRfaWQ9JyArIENsaWVudC5fY2xpZW50SWQgKyAnJnJlZGlyZWN0X3VyaT0nICsgY2FsbGJhY2tVUkwgKyAnJnNjb3BlPScgKyBzY29wZTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnNldHVwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvc2V0dXAuaHRtbCc7XG4gICAgfTtcblxuICAgICRzY29wZS5lcnJvciA9IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnL2Vycm9yLmh0bWwnO1xuICAgIH07XG5cbiAgICBDbGllbnQuaXNTZXJ2ZXJGaXJzdFRpbWUoZnVuY3Rpb24gKGVycm9yLCBpc0ZpcnN0VGltZSkge1xuICAgICAgICBpZiAoZXJyb3IpIHJldHVybiAkc2NvcGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICBpZiAoaXNGaXJzdFRpbWUpIHJldHVybiAkc2NvcGUuc2V0dXAoKTtcblxuICAgICAgICAvLyB3ZSB1c2UgdGhlIGNvbmZpZyByZXF1ZXN0IGFzIGFuIGluZGljYXRvciBpZiB0aGUgdG9rZW4gaXMgc3RpbGwgdmFsaWRcbiAgICAgICAgLy8gVE9ETyB3ZSBzaG91bGQgcHJvYmFibHkgYXR0YWNoIHN1Y2ggYSBoYW5kbGVyIGZvciBlYWNoIHJlcXVlc3QsIGFzIHRoZSB0b2tlbiBjYW4gZ2V0IGludmFsaWRcbiAgICAgICAgLy8gYXQgYW55IHRpbWUhXG4gICAgICAgIGlmIChsb2NhbFN0b3JhZ2UudG9rZW4pIHtcbiAgICAgICAgICAgIENsaWVudC5yZWZyZXNoQ29uZmlnKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDEpIHJldHVybiAkc2NvcGUubG9naW4oKTtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiAkc2NvcGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgd2UgYXJlIGFjdHVhbGx5IHVwZGF0ZWluZ1xuICAgICAgICAgICAgICAgIGlmIChDbGllbnQuZ2V0Q29uZmlnKCkucHJvZ3Jlc3MudXBkYXRlKSB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvdXBkYXRlLmh0bWwnO1xuXG4gICAgICAgICAgICAgICAgQ2xpZW50LnVzZXJJbmZvKGZ1bmN0aW9uIChlcnJvciwgcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAgICAgQ2xpZW50LnNldFVzZXJJbmZvKHJlc3VsdCk7XG5cbiAgICAgICAgICAgICAgICAgICAgQ2xpZW50LnJlZnJlc2hJbnN0YWxsZWRBcHBzKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8ga2ljayBvZmYgaW5zdGFsbGVkIGFwcHMgYW5kIGNvbmZpZyBwb2xsaW5nXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVmcmVzaEFwcHNUaW1lciA9ICRpbnRlcnZhbChDbGllbnQucmVmcmVzaEluc3RhbGxlZEFwcHMuYmluZChDbGllbnQpLCAyMDAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWZyZXNoQ29uZmlnVGltZXIgPSAkaW50ZXJ2YWwoQ2xpZW50LnJlZnJlc2hDb25maWcuYmluZChDbGllbnQpLCA1MDAwKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJGludGVydmFsLmNhbmNlbChyZWZyZXNoQXBwc1RpbWVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHJlZnJlc2hDb25maWdUaW1lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbm93IG1hcmsgdGhlIENsaWVudCB0byBiZSByZWFkeVxuICAgICAgICAgICAgICAgICAgICAgICAgQ2xpZW50LnNldFJlYWR5KCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkc2NvcGUubG9naW4oKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gd2FpdCB0aWxsIHRoZSB2aWV3IGhhcyBsb2FkZWQgdW50aWwgc2hvd2luZyBhIG1vZGFsIGRpYWxvZ1xuICAgIENsaWVudC5vbkNvbmZpZyhmdW5jdGlvbiAoY29uZmlnKSB7XG4gICAgICAgIGlmIChjb25maWcucHJvZ3Jlc3MudXBkYXRlKSB7XG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvdXBkYXRlLmh0bWwnO1xuICAgICAgICB9XG4gICAgfSk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0FjY291bnRDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgJHNjb3BlLnVzZXIgPSBDbGllbnQuZ2V0VXNlckluZm8oKTtcbiAgICAkc2NvcGUuY29uZmlnID0gQ2xpZW50LmdldENvbmZpZygpO1xuXG4gICAgJHNjb3BlLmNoYW5nZVBhc3N3b3JkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkbG9jYXRpb24ucGF0aCgnL3VzZXJwYXNzd29yZCcpO1xuICAgICAgICAvLyB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjL3VzZXJwYXNzd29yZCc7XG4gICAgfTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignQXBwQ29uZmlndXJlQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRyb3V0ZVBhcmFtcycsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJHJvdXRlUGFyYW1zLCAkbG9jYXRpb24sIENsaWVudCkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUuYXBwID0gbnVsbDtcbiAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAkc2NvcGUubG9jYXRpb24gPSAnJztcbiAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSAnJztcbiAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAkc2NvcGUuZXJyb3IgPSB7fTtcbiAgICAkc2NvcGUuZG9tYWluID0gJyc7XG4gICAgJHNjb3BlLnBvcnRCaW5kaW5ncyA9IHsgfTtcblxuICAgICRzY29wZS5jb25maWd1cmVBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gbnVsbDtcbiAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gbnVsbDtcblxuICAgICAgICB2YXIgcG9ydEJpbmRpbmdzID0geyB9O1xuICAgICAgICBmb3IgKHZhciBjb250YWluZXJQb3J0IGluICRzY29wZS5wb3J0QmluZGluZ3MpIHtcbiAgICAgICAgICAgIHBvcnRCaW5kaW5nc1tjb250YWluZXJQb3J0XSA9ICRzY29wZS5wb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF0uaG9zdFBvcnQ7XG4gICAgICAgIH1cblxuICAgICAgICBDbGllbnQuY29uZmlndXJlQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgJHNjb3BlLnBhc3N3b3JkLCB7IGxvY2F0aW9uOiAkc2NvcGUubG9jYXRpb24sIHBvcnRCaW5kaW5nczogcG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yLnN0YXR1c0NvZGUgPT09IDQwMykge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IucGFzc3dvcmQgPSAnV3JvbmcgcGFzc3dvcmQgcHJvdmlkZWQuJztcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSAnQXBwIHdpdGggdGhlIG5hbWUgJyArICRzY29wZS5hcHAubmFtZSArICcgY2Fubm90IGJlIGNvbmZpZ3VyZWQuJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZXBsYWNlKCcjL2FwcC8nICsgJHJvdXRlUGFyYW1zLmFwcElkICsgJy9kZXRhaWxzJyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmRvbWFpbiA9IENsaWVudC5nZXRDb25maWcoKS5mcWRuO1xuXG4gICAgICAgIENsaWVudC5nZXRBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IsIGFwcCkge1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gZXJyb3IgfHwgeyB9O1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm47XG5cbiAgICAgICAgICAgICRzY29wZS5hcHAgPSBhcHA7XG4gICAgICAgICAgICAkc2NvcGUubG9jYXRpb24gPSBhcHAubG9jYXRpb247XG4gICAgICAgICAgICAkc2NvcGUucG9ydEJpbmRpbmdzID0gYXBwLm1hbmlmZXN0LnRjcFBvcnRzO1xuICAgICAgICAgICAgJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uID0gYXBwLmFjY2Vzc1Jlc3RyaWN0aW9uO1xuICAgICAgICAgICAgZm9yICh2YXIgY29udGFpbmVyUG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5nc1tjb250YWluZXJQb3J0XS5ob3N0UG9ydCA9IGFwcC5wb3J0QmluZGluZ3NbY29udGFpbmVyUG9ydF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0TG9jYXRpb24nKS5mb2N1cygpO1xufV0pO1xuIiwiLyogZ2xvYmFsICQ6dHJ1ZSAqL1xuLyogZ2xvYmFsIFJpY2tzaGF3OnRydWUgKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdBcHBEZXRhaWxzQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRodHRwJywgJyRyb3V0ZVBhcmFtcycsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGh0dHAsICRyb3V0ZVBhcmFtcywgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLmFwcCA9IHt9O1xuICAgICRzY29wZS5pbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICRzY29wZS51cGRhdGVBdmFpbGFibGUgPSBmYWxzZTtcbiAgICAkc2NvcGUuYWN0aXZlVGFiID0gJ2RheSc7XG4gICAgJHNjb3BlLnVwZGF0ZVZlcnNpb24gPSBudWxsO1xuXG4gICAgJHNjb3BlLnN0YXJ0QXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQuc3RhcnRBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc3RvcEFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnN0b3BBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUudXBkYXRlQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQudXBkYXRlQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgJHNjb3BlLnVwZGF0ZVZlcnNpb24sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5kZWxldGVBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNkZWxldGVBcHBNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG5cbiAgICAgICAgQ2xpZW50LnJlbW92ZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvJztcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHJlbmRlckNwdShhY3RpdmVUYWIsIGNwdURhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkQ3B1ID0gWyBdO1xuXG4gICAgICAgIGlmIChjcHVEYXRhICYmIGNwdURhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRDcHUgPSBjcHVEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcblxuICAgICAgICB2YXIgY3B1R3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnQ3B1Q2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDEwMCxcbiAgICAgICAgICAgIHNlcmllczogW3tcbiAgICAgICAgICAgICAgICBjb2xvcjogJ3N0ZWVsYmx1ZScsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRDcHUgfHwgWyBdLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdjcHUnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGNwdUdyYXBoIH0pO1xuICAgICAgICB2YXIgY3B1WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdDcHVZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5KS50b0ZpeGVkKDIpICsgJyU8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY3B1R3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTWVtb3J5KGFjdGl2ZVRhYiwgbWVtb3J5RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRNZW1vcnkgPSBbIF07XG5cbiAgICAgICAgaWYgKG1lbW9yeURhdGEgJiYgbWVtb3J5RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZE1lbW9yeSA9IG1lbW9yeURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBtZW1vcnlHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdNZW1vcnlDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMiAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMmdiXG4gICAgICAgICAgICBzZXJpZXM6IFsge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZE1lbW9yeSB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ21lbW9yeSdcbiAgICAgICAgICAgIH0gXVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIG1lbW9yeVhBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBtZW1vcnlHcmFwaCB9KTtcbiAgICAgICAgdmFyIG1lbW9yeVlBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogbWVtb3J5R3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnTWVtb3J5WUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIG1lbW9yeUhvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBtZW1vcnlHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeS8oMTAyNCoxMDI0KSkudG9GaXhlZCgyKSArICdNQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBtZW1vcnlHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGlza0RhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkRGlzayA9IFsgXTtcblxuICAgICAgICBpZiAoZGlza0RhdGEgJiYgZGlza0RhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWREaXNrID0gZGlza0RhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBkaXNrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnRGlza0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAzMCAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMzBnYlxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZERpc2sgfHwgWyBdLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBzJ1xuICAgICAgICAgICAgfV1cbiAgICAgICAgfSApO1xuXG4gICAgICAgIHZhciBkaXNrWEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGRpc2tHcmFwaCB9KTtcbiAgICAgICAgdmFyIGRpc2tZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrWUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LygxMDI0ICogMTAyNCkpLnRvRml4ZWQoMikgKyAnTUI8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tMZWdlbmQgPSBuZXcgUmlja3NoYXcuR3JhcGguTGVnZW5kKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza0xlZ2VuZCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRpc2tHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAkc2NvcGUudXBkYXRlR3JhcGhzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY3B1VXNhZ2VUYXJnZXQgPVxuICAgICAgICAgICAgJ25vbk5lZ2F0aXZlRGVyaXZhdGl2ZSgnICtcbiAgICAgICAgICAgICAgICAnc3VtU2VyaWVzKGNvbGxlY3RkLmxvY2FsaG9zdC50YWJsZS0nICsgJHNjb3BlLmFwcC5pZCArICctY3B1LmdhdWdlLXVzZXIsJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICdjb2xsZWN0ZC5sb2NhbGhvc3QudGFibGUtJyArICRzY29wZS5hcHAuaWQgKyAnLWNwdS5nYXVnZS1zeXN0ZW0pKSc7IC8vIGFzc3VtZXMgMTAwIGppZmZpZXMgcGVyIHNlYyAoVVNFUl9IWilcblxuICAgICAgICB2YXIgbWVtb3J5VXNhZ2VUYXJnZXQgPSAnY29sbGVjdGQubG9jYWxob3N0LnRhYmxlLScgKyAkc2NvcGUuYXBwLmlkICsgJy1tZW1vcnkuZ2F1Z2UtbWF4X3VzYWdlX2luX2J5dGVzJztcblxuICAgICAgICB2YXIgZGlza1VzYWdlVGFyZ2V0ID0gJ2NvbGxlY3RkLmxvY2FsaG9zdC5maWxlY291bnQtJyArICRzY29wZS5hcHAuaWQgKyAnLWFwcGRhdGEuYnl0ZXMnO1xuXG4gICAgICAgIHZhciBhY3RpdmVUYWIgPSAkc2NvcGUuYWN0aXZlVGFiO1xuICAgICAgICB2YXIgZnJvbSA9ICctMjRob3Vycyc7XG4gICAgICAgIHN3aXRjaCAoYWN0aXZlVGFiKSB7XG4gICAgICAgIGNhc2UgJ2RheSc6IGZyb20gPSAnLTI0aG91cnMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnbW9udGgnOiBmcm9tID0gJy0xbW9udGgnOyBicmVhaztcbiAgICAgICAgY2FzZSAneWVhcic6IGZyb20gPSAnLTF5ZWFyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUubG9nKCdpbnRlcm5hbCBlcnJyb3InKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5ncmFwaHMoWyBjcHVVc2FnZVRhcmdldCwgbWVtb3J5VXNhZ2VUYXJnZXQsIGRpc2tVc2FnZVRhcmdldCBdLCBmcm9tLCBmdW5jdGlvbiAoZXJyb3IsIGRhdGEpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUubG9nKGVycm9yKTtcblxuICAgICAgICAgICAgcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgZGF0YVswXSk7XG5cbiAgICAgICAgICAgIHJlbmRlck1lbW9yeShhY3RpdmVUYWIsIGRhdGFbMV0pO1xuXG4gICAgICAgICAgICByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGF0YVsyXSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeShmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgQ2xpZW50LmdldEFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjLyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkc2NvcGUuYXBwID0gYXBwO1xuICAgICAgICAgICAgJHNjb3BlLmFwcExvZ1VybCA9IENsaWVudC5nZXRBcHBMb2dVcmwoYXBwLmlkKTtcblxuICAgICAgICAgICAgaWYgKENsaWVudC5nZXRDb25maWcoKS51cGRhdGUgJiYgQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZS5hcHBzKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFwcFVwZGF0ZXMgPSBDbGllbnQuZ2V0Q29uZmlnKCkudXBkYXRlLmFwcHM7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcHBVcGRhdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcHBVcGRhdGVzW2ldLmFwcElkID09PSAkc2NvcGUuYXBwLmFwcFN0b3JlSWQgJiYgYXBwVXBkYXRlc1tpXS52ZXJzaW9uICE9PSAgJHNjb3BlLmFwcC52ZXJzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAkc2NvcGUudXBkYXRlQXZhaWxhYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS51cGRhdGVWZXJzaW9uID0gYXBwVXBkYXRlc1tpXS52ZXJzaW9uO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkc2NvcGUudXBkYXRlR3JhcGhzKCk7XG5cbiAgICAgICAgICAgICRzY29wZS5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdBcHBJbnN0YWxsQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRyb3V0ZVBhcmFtcycsICckbG9jYXRpb24nLCAnQ2xpZW50JywgJ0FwcFN0b3JlJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKCRzY29wZSwgJHJvdXRlUGFyYW1zLCAkbG9jYXRpb24sIENsaWVudCwgQXBwU3RvcmUsICR0aW1lb3V0KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5hcHAgPSBudWxsO1xuICAgICRzY29wZS5wYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS5sb2NhdGlvbiA9ICcnO1xuICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9ICcnO1xuICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICRzY29wZS5lcnJvciA9IHsgfTtcbiAgICAkc2NvcGUuZG9tYWluID0gJyc7XG4gICAgJHNjb3BlLnZlcnNpb24gPSBudWxsO1xuICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSB7IH07XG4gICAgJHNjb3BlLmhvc3RQb3J0TWluID0gMTAyNTtcbiAgICAkc2NvcGUuaG9zdFBvcnRNYXggPSA5OTk5O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZG9tYWluID0gQ2xpZW50LmdldENvbmZpZygpLmZxZG47XG5cbiAgICAgICAgQXBwU3RvcmUuZ2V0QXBwQnlJZCgkcm91dGVQYXJhbXMuYXBwU3RvcmVJZCwgZnVuY3Rpb24gKGVycm9yLCBhcHApIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IGVycm9yIHx8IHsgfTtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuO1xuICAgICAgICAgICAgJHNjb3BlLmFwcCA9IGFwcDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVE9ETzogdGhpcyBzaG91bGQgYmUgYmFzZWQgb24gYm94VmVyc2lvblxuICAgICAgICBBcHBTdG9yZS5nZXRNYW5pZmVzdCgkcm91dGVQYXJhbXMuYXBwU3RvcmVJZCwgZnVuY3Rpb24gKGVycm9yLCBtYW5pZmVzdCkge1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gZXJyb3IgfHwgeyB9O1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm47XG4gICAgICAgICAgICAkc2NvcGUudmVyc2lvbiA9IG1hbmlmZXN0LnZlcnNpb247XG4gICAgICAgICAgICAkc2NvcGUucG9ydEJpbmRpbmdzID0gbWFuaWZlc3QudGNwUG9ydHM7XG4gICAgICAgICAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSBtYW5pZmVzdC5hY2Nlc3NSZXN0cmljdGlvbiB8fCAnJztcbiAgICAgICAgICAgIC8vIGRlZmF1bHQgc2V0dGluZyBpcyB0byBtYXAgcG9ydHMgYXMgdGhleSBhcmUgaW4gbWFuaWZlc3RcbiAgICAgICAgICAgIGZvciAodmFyIHBvcnQgaW4gJHNjb3BlLnBvcnRCaW5kaW5ncykge1xuICAgICAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3NbcG9ydF0uaG9zdFBvcnQgPSBwYXJzZUludChwb3J0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAkc2NvcGUuaW5zdGFsbEFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSBudWxsO1xuICAgICAgICAkc2NvcGUuZXJyb3IucGFzc3dvcmQgPSBudWxsO1xuXG4gICAgICAgIHZhciBwb3J0QmluZGluZ3MgPSB7IH07XG4gICAgICAgIGZvciAodmFyIHBvcnQgaW4gJHNjb3BlLnBvcnRCaW5kaW5ncykge1xuICAgICAgICAgICAgcG9ydEJpbmRpbmdzW3BvcnRdID0gJHNjb3BlLnBvcnRCaW5kaW5nc1twb3J0XS5ob3N0UG9ydDtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5pbnN0YWxsQXBwKCRyb3V0ZVBhcmFtcy5hcHBTdG9yZUlkLCAkc2NvcGUudmVyc2lvbiwgJHNjb3BlLnBhc3N3b3JkLCAkc2NvcGUuYXBwLnRpdGxlLCB7IGxvY2F0aW9uOiAkc2NvcGUubG9jYXRpb24sIHBvcnRCaW5kaW5nczogcG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uIH0sIGZ1bmN0aW9uIChlcnJvciwgYXBwSWQpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDkpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSAnQXBwbGljYXRpb24gYWxyZWFkeSBleGlzdHMuJztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGVycm9yLnN0YXR1c0NvZGUgPT09IDQwMykge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IucGFzc3dvcmQgPSAnV3JvbmcgcGFzc3dvcmQgcHJvdmlkZWQuJztcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSAnQXBwIHdpdGggdGhlIG5hbWUgJyArICRzY29wZS5hcHAubmFtZSArICcgY2Fubm90IGJlIGluc3RhbGxlZC4nO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlcGxhY2UoJyMvYXBwLycgKyBhcHBJZCArICcvZGV0YWlscycpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmNhbmNlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgIH07XG5cbiAgICAvLyBoYWNrIGZvciBhdXRvZm9jdXMgd2l0aCBhbmd1bGFyXG4gICAgJHNjb3BlLiRvbignJHZpZXdDb250ZW50TG9hZGVkJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAkdGltZW91dChmdW5jdGlvbiAoKSB7ICQoJ2lucHV0W2F1dG9mb2N1c106dmlzaWJsZTpmaXJzdCcpLmZvY3VzKCk7IH0sIDEwMDApO1xuICAgIH0pO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdEYXNoYm9hcmRDb250cm9sbGVyJywgZnVuY3Rpb24gKCkge1xuXG59KTtcbiIsIi8qIGdsb2JhbDpSaWNrc2hhdzp0cnVlICovXG5cbid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignR3JhcGhzQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkbG9jYXRpb24sIENsaWVudCkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUuYWN0aXZlVGFiID0gJ2RheSc7XG5cbiAgICB2YXIgY3B1VXNhZ2VUYXJnZXQgPSAndHJhbnNmb3JtTnVsbCgnICtcbiAgICAnc2NhbGUoZGl2aWRlU2VyaWVzKCcgK1xuICAgICAgICAnc3VtU2VyaWVzKGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtc3lzdGVtLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtbmljZSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXVzZXIpLCcgK1xuICAgICAgICAnc3VtU2VyaWVzKGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtaWRsZSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXN5c3RlbSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LW5pY2UsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS11c2VyLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtd2FpdCkpLCAxMDApLCAwKSc7XG5cbiAgICB2YXIgbmV0d29ya1VzYWdlVHhUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuaW50ZXJmYWNlLWV0aDAuaWZfb2N0ZXRzLnR4LCAwKSc7XG4gICAgdmFyIG5ldHdvcmtVc2FnZVJ4VGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoY29sbGVjdGQubG9jYWxob3N0LmludGVyZmFjZS1ldGgwLmlmX29jdGV0cy5yeCwgMCknO1xuXG4gICAgdmFyIGRpc2tVc2FnZUFwcHNVc2VkVGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoY29sbGVjdGQubG9jYWxob3N0LmRmLWxvb3AwLmRmX2NvbXBsZXgtdXNlZCwgMCknO1xuICAgIHZhciBkaXNrVXNhZ2VEYXRhVXNlZFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5kZi1sb29wMS5kZl9jb21wbGV4LXVzZWQsIDApJztcblxuICAgIGZ1bmN0aW9uIHJlbmRlckNwdShhY3RpdmVUYWIsIGNwdURhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkQ3B1ID0gWyBdO1xuXG4gICAgICAgIGlmIChjcHVEYXRhICYmIGNwdURhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRDcHUgPSBjcHVEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcblxuICAgICAgICB2YXIgY3B1R3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnQ3B1Q2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDEwMCxcbiAgICAgICAgICAgIHNlcmllczogW3tcbiAgICAgICAgICAgICAgICBjb2xvcjogJ3N0ZWVsYmx1ZScsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRDcHUsXG4gICAgICAgICAgICAgICAgbmFtZTogJ2NwdSdcbiAgICAgICAgICAgIH1dXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBjcHVYQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlRpbWUoeyBncmFwaDogY3B1R3JhcGggfSk7XG4gICAgICAgIHZhciBjcHVZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgb3JpZW50YXRpb246ICdsZWZ0JyxcbiAgICAgICAgICAgIHRpY2tGb3JtYXQ6IFJpY2tzaGF3LkZpeHR1cmVzLk51bWJlci5mb3JtYXRLTUJULFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0NwdVlBeGlzJyksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBjcHVIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogY3B1R3JhcGgsXG4gICAgICAgICAgICBmb3JtYXR0ZXI6IGZ1bmN0aW9uKHNlcmllcywgeCwgeSkge1xuICAgICAgICAgICAgICAgIHZhciBzd2F0Y2ggPSAnPHNwYW4gY2xhc3M9XCJkZXRhaWxfc3dhdGNoXCIgc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiAnICsgc2VyaWVzLmNvbG9yICsgJ1wiPjwvc3Bhbj4nO1xuICAgICAgICAgICAgICAgIHZhciBjb250ZW50ID0gc3dhdGNoICsgc2VyaWVzLm5hbWUgKyBcIjogXCIgKyBuZXcgTnVtYmVyKHkpLnRvRml4ZWQoMikgKyAnJTxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjcHVHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJOZXR3b3JrKGFjdGl2ZVRhYiwgdHhEYXRhLCByeERhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkVHggPSBbIF0sIHRyYW5zZm9ybWVkUnggPSBbIF07XG5cbiAgICAgICAgaWYgKHR4RGF0YSAmJiB0eERhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRUeCA9IHR4RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG4gICAgICAgIGlmIChyeERhdGEgJiYgcnhEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkUnggPSByeERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBuZXR3b3JrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnTmV0d29ya0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgc2VyaWVzOiBbIHtcbiAgICAgICAgICAgICAgICBjb2xvcjogJ3N0ZWVsYmx1ZScsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRUeCxcbiAgICAgICAgICAgICAgICBuYW1lOiAndHgnXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdncmVlbicsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRSeCxcbiAgICAgICAgICAgICAgICBuYW1lOiAncngnXG4gICAgICAgICAgICB9IF1cbiAgICAgICAgfSApO1xuXG4gICAgICAgIHZhciBuZXR3b3JrWEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IG5ldHdvcmtHcmFwaCB9KTtcbiAgICAgICAgdmFyIG5ldHdvcmtZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IG5ldHdvcmtHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdOZXR3b3JrWUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIG5ldHdvcmtIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogbmV0d29ya0dyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LzEwMjQpLnRvRml4ZWQoMikgKyAnS0I8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV0d29ya0dyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbmRlckRpc2soYWN0aXZlVGFiLCBhcHBzVXNlZERhdGEsIGRhdGFVc2VkRGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRBcHBzVXNlZCA9IFsgXSwgdHJhbnNmb3JtZWREYXRhVXNlZCA9IFsgXTtcblxuICAgICAgICBpZiAoYXBwc1VzZWREYXRhICYmIGFwcHNVc2VkRGF0YS5kYXRhcG9pbnRzKSB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1lZEFwcHNVc2VkID0gYXBwc1VzZWREYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGF0YVVzZWREYXRhICYmIGRhdGFVc2VkRGF0YS5kYXRhcG9pbnRzKSB7XG4gICAgICAgICAgICB0cmFuc2Zvcm1lZERhdGFVc2VkID0gZGF0YVVzZWREYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZGlza0dyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ0Rpc2tDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMzAgKiAxMDI0ICogMTAyNCAqIDEwMjQsIC8vIDMwZ2JcbiAgICAgICAgICAgIHNlcmllczogW3tcbiAgICAgICAgICAgICAgICBjb2xvcjogJ3N0ZWVsYmx1ZScsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRBcHBzVXNlZCxcbiAgICAgICAgICAgICAgICBuYW1lOiAnYXBwcydcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBjb2xvcjogJ2dyZWVuJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZERhdGFVc2VkLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdkYXRhJ1xuICAgICAgICAgICAgfV1cbiAgICAgICAgfSApO1xuXG4gICAgICAgIHZhciBkaXNrWEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGRpc2tHcmFwaCB9KTtcbiAgICAgICAgdmFyIGRpc2tZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrWUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LygxMDI0ICogMTAyNCAqIDEwMjQpKS50b0ZpeGVkKDIpICsgJ0dCPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkaXNrTGVnZW5kID0gbmV3IFJpY2tzaGF3LkdyYXBoLkxlZ2VuZCh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYWN0aXZlVGFiICsgJ0Rpc2tMZWdlbmQnKVxuICAgICAgICB9KTtcblxuICAgICAgICBkaXNrR3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgJHNjb3BlLnVwZGF0ZUdyYXBocyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFjdGl2ZVRhYiA9ICRzY29wZS5hY3RpdmVUYWI7XG4gICAgICAgdmFyIGZyb20gPSAnLTI0aG91cnMnO1xuICAgICAgICBzd2l0Y2ggKGFjdGl2ZVRhYikge1xuICAgICAgICBjYXNlICdkYXknOiBmcm9tID0gJy0yNGhvdXJzJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ21vbnRoJzogZnJvbSA9ICctMW1vbnRoJzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3llYXInOiBmcm9tID0gJy0xeWVhcic7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiBjb25zb2xlLmxvZygnaW50ZXJuYWwgZXJycm9yJyk7XG4gICAgICAgIH1cblxuICAgICAgICBDbGllbnQuZ3JhcGhzKFsgY3B1VXNhZ2VUYXJnZXQsIG5ldHdvcmtVc2FnZVR4VGFyZ2V0LCBuZXR3b3JrVXNhZ2VSeFRhcmdldCwgZGlza1VzYWdlQXBwc1VzZWRUYXJnZXQsIGRpc2tVc2FnZURhdGFVc2VkVGFyZ2V0IF0sIGZyb20sIGZ1bmN0aW9uIChlcnJvciwgZGF0YSkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5sb2coZXJyb3IpO1xuXG4gICAgICAgICAgICByZW5kZXJDcHUoYWN0aXZlVGFiLCBkYXRhWzBdKTtcblxuICAgICAgICAgICAgcmVuZGVyTmV0d29yayhhY3RpdmVUYWIsIGRhdGFbMV0sIGRhdGFbMl0pO1xuXG4gICAgICAgICAgICByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGF0YVszXSwgZGF0YVs0XSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeSgkc2NvcGUudXBkYXRlR3JhcGhzKTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignU2VjdXJpdHlDb250cm9sbGVyJywgWyckc2NvcGUnLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgQ2xpZW50KSB7XG4gICAgJHNjb3BlLmFjdGl2ZUNsaWVudHMgPSBbXTtcbiAgICAkc2NvcGUudG9rZW5JblVzZSA9IG51bGw7XG5cbiAgICAkc2NvcGUucmVtb3ZlQWNjZXNzVG9rZW5zID0gZnVuY3Rpb24gKGNsaWVudCwgZXZlbnQpIHtcbiAgICAgICAgY2xpZW50Ll9idXN5ID0gdHJ1ZTtcblxuICAgICAgICBDbGllbnQuZGVsVG9rZW5zQnlDbGllbnRJZChjbGllbnQuaWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICAgICAgICAkKGV2ZW50LnRhcmdldCkuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG4gICAgICAgICAgICBjbGllbnQuX2J1c3kgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLnRva2VuSW5Vc2UgPSBDbGllbnQuX3Rva2VuO1xuXG4gICAgICAgIENsaWVudC5nZXRPQXV0aENsaWVudHMoZnVuY3Rpb24gKGVycm9yLCBhY3RpdmVDbGllbnRzKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgJHNjb3BlLmFjdGl2ZUNsaWVudHMgPSBhY3RpdmVDbGllbnRzO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignU2V0dGluZ3NDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS51c2VyID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLmNvbmZpZyA9IENsaWVudC5nZXRDb25maWcoKTtcbiAgICAkc2NvcGUubmFrZWREb21haW5BcHAgPSBudWxsO1xuICAgICRzY29wZS5kcml2ZXMgPSBbXTtcbiAgICAkc2NvcGUuY2VydGlmaWNhdGVGaWxlID0gbnVsbDtcbiAgICAkc2NvcGUuY2VydGlmaWNhdGVGaWxlTmFtZSA9ICcnO1xuICAgICRzY29wZS5rZXlGaWxlID0gbnVsbDtcbiAgICAkc2NvcGUua2V5RmlsZU5hbWUgPSAnJztcblxuICAgICRzY29wZS5zZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFwcGlkID0gJHNjb3BlLm5ha2VkRG9tYWluQXBwID8gJHNjb3BlLm5ha2VkRG9tYWluQXBwLmlkIDogJ2FkbWluJztcblxuICAgICAgICBDbGllbnQuc2V0TmFrZWREb21haW4oYXBwaWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignRXJyb3Igc2V0dGluZyBuYWtlZCBkb21haW4nLCBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuYmFja3VwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkKCcjYmFja3VwUHJvZ3Jlc3NNb2RhbCcpLm1vZGFsKCdzaG93Jyk7XG4gICAgICAgICRzY29wZS4kcGFyZW50LmluaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgQ2xpZW50LmJhY2t1cChmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIC8vIG5vdyBzdGFydCBxdWVyeVxuICAgICAgICAgICAgZnVuY3Rpb24gY2hlY2tJZkRvbmUoKSB7XG4gICAgICAgICAgICAgICAgQ2xpZW50LnZlcnNpb24oZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCAxMDAwKTtcblxuICAgICAgICAgICAgICAgICAgICAkKCcjYmFja3VwUHJvZ3Jlc3NNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS4kcGFyZW50LmluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDUwMDApO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnJlYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJCgnI3JlYm9vdE1vZGFsJykubW9kYWwoJ2hpZGUnKTtcbiAgICAgICAgJCgnI3JlYm9vdFByb2dyZXNzTW9kYWwnKS5tb2RhbCgnc2hvdycpO1xuICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IGZhbHNlO1xuXG4gICAgICAgIENsaWVudC5yZWJvb3QoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAvLyBub3cgc3RhcnQgcXVlcnlcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNoZWNrSWZEb25lKCkge1xuICAgICAgICAgICAgICAgIENsaWVudC52ZXJzaW9uKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgMTAwMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgJCgnI3JlYm9vdFByb2dyZXNzTW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuXG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQuYmluZCh3aW5kb3cubG9jYXRpb24sIHRydWUpLCAxMDAwKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDUwMDApO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnVwZGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJCgnI3VwZGF0ZU1vZGFsJykubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAkc2NvcGUuJHBhcmVudC5pbml0aWFsaXplZCA9IGZhbHNlO1xuXG4gICAgICAgIENsaWVudC51cGRhdGUoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvdXBkYXRlLmh0bWwnO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkQ2VydGlmaWNhdGUnKS5vbmNoYW5nZSA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAkc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUgPSBldmVudC50YXJnZXQuZmlsZXNbMF07XG4gICAgICAgICAgICAkc2NvcGUuY2VydGlmaWNhdGVGaWxlTmFtZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXS5uYW1lO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lkS2V5Jykub25jaGFuZ2UgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgJHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAkc2NvcGUua2V5RmlsZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXTtcbiAgICAgICAgICAgICRzY29wZS5rZXlGaWxlTmFtZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXS5uYW1lO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnNldENlcnRpZmljYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zb2xlLmxvZygnV2lsbCBzZXQgdGhlIGNlcnRpZmljYXRlJyk7XG5cbiAgICAgICAgaWYgKCEkc2NvcGUuY2VydGlmaWNhdGVGaWxlKSByZXR1cm4gY29uc29sZS5sb2coJ0NlcnRpZmljYXRlIG5vdCBzZXQnKTtcbiAgICAgICAgaWYgKCEkc2NvcGUua2V5RmlsZSkgcmV0dXJuIGNvbnNvbGUubG9nKCdLZXkgbm90IHNldCcpO1xuXG4gICAgICAgIENsaWVudC5zZXRDZXJ0aWZpY2F0ZSgkc2NvcGUuY2VydGlmaWNhdGVGaWxlLCAkc2NvcGUua2V5RmlsZSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmxvZyhlcnJvcik7XG5cbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQuYmluZCh3aW5kb3cubG9jYXRpb24sIHRydWUpLCAzMDAwKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5vbkNvbmZpZyhmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS50b2tlbkluVXNlID0gQ2xpZW50Ll90b2tlbjtcblxuICAgICAgICBDbGllbnQuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBhcHAgbGlzdCcpO1xuICAgICAgICAgICAgJHNjb3BlLmFwcHMgPSBhcHBzO1xuXG4gICAgICAgICAgICBDbGllbnQuZ2V0TmFrZWREb21haW4oZnVuY3Rpb24gKGVycm9yLCBhcHBpZCkge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLm5ha2VkRG9tYWluQXBwID0gbnVsbDtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8ICRzY29wZS5hcHBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICgkc2NvcGUuYXBwc1tpXS5pZCA9PT0gYXBwaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICRzY29wZS5uYWtlZERvbWFpbkFwcCA9ICRzY29wZS5hcHBzW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgQ2xpZW50LnN0YXRzKGZ1bmN0aW9uIChlcnJvciwgc3RhdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgICRzY29wZS5kcml2ZXMgPSBzdGF0cy5kcml2ZXM7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ1VzZXJDcmVhdGVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGVQYXJhbXMsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuXG4gICAgJHNjb3BlLnVzZXJuYW1lID0gJyc7XG4gICAgJHNjb3BlLmVtYWlsID0gJyc7XG4gICAgJHNjb3BlLmFscmVhZHlUYWtlbiA9ICcnO1xuXG4gICAgJHNjb3BlLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmFscmVhZHlUYWtlbiA9ICcnO1xuXG4gICAgICAgICRzY29wZS5kaXNhYmxlZCA9IHRydWU7XG5cbiAgICAgICAgQ2xpZW50LmNyZWF0ZVVzZXIoJHNjb3BlLnVzZXJuYW1lLCAkc2NvcGUuZW1haWwsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnN0YXR1c0NvZGUgPT09IDQwOSkge1xuICAgICAgICAgICAgICAgICRzY29wZS5hbHJlYWR5VGFrZW4gPSAkc2NvcGUudXNlcm5hbWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VzZXJuYW1lIGFscmVhZHkgdGFrZW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGNyZWF0ZSB1c2VyLicsIGVycm9yKTtcblxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy91c2VybGlzdCc7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignVXNlckxpc3RDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5yZWFkeSA9IGZhbHNlO1xuICAgICRzY29wZS51c2VycyA9IFtdO1xuICAgICRzY29wZS51c2VySW5mbyA9IENsaWVudC5nZXRVc2VySW5mbygpO1xuICAgICRzY29wZS51c2VyRGVsZXRlRm9ybSA9IHtcbiAgICAgICAgdXNlcm5hbWU6ICcnLFxuICAgICAgICBwYXNzd29yZDogJydcbiAgICB9O1xuXG4gICAgJHNjb3BlLmlzTWUgPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gdXNlci51c2VybmFtZSA9PT0gQ2xpZW50LmdldFVzZXJJbmZvKCkudXNlcm5hbWU7XG4gICAgfTtcblxuICAgICRzY29wZS5pc0FkbWluID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuICEhdXNlci5hZG1pbjtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnRvZ2dsZUFkbWluID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgQ2xpZW50LnNldEFkbWluKHVzZXIudXNlcm5hbWUsICF1c2VyLmFkbWluLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICB1c2VyLmFkbWluID0gIXVzZXIuYWRtaW47XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuZGVsZXRlVXNlciA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIC8vIFRPRE8gYWRkIGJ1c3kgaW5kaWNhdG9yIGFuZCBibG9jayBmb3JtXG4gICAgICAgIGlmICgkc2NvcGUudXNlckRlbGV0ZUZvcm0udXNlcm5hbWUgIT09IHVzZXIudXNlcm5hbWUpIHJldHVybiBjb25zb2xlLmVycm9yKCdVc2VybmFtZSBkb2VzIG5vdCBtYXRjaCcpO1xuXG4gICAgICAgIENsaWVudC5yZW1vdmVVc2VyKHVzZXIudXNlcm5hbWUsICRzY29wZS51c2VyRGVsZXRlRm9ybS5wYXNzd29yZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAxKSByZXR1cm4gY29uc29sZS5lcnJvcignV3JvbmcgcGFzc3dvcmQnKTtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBkZWxldGUgdXNlci4nLCBlcnJvcik7XG5cbiAgICAgICAgICAgICQoJyN1c2VyRGVsZXRlTW9kYWwtJyArIHVzZXIudXNlcm5hbWUpLm1vZGFsKCdoaWRlJyk7XG5cbiAgICAgICAgICAgIHJlZnJlc2goKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHJlZnJlc2goKSB7XG4gICAgICAgIENsaWVudC5saXN0VXNlcnMoZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBnZXQgdXNlciBsaXN0aW5nLicsIGVycm9yKTtcblxuICAgICAgICAgICAgJHNjb3BlLnVzZXJzID0gcmVzdWx0LnVzZXJzO1xuICAgICAgICAgICAgJHNjb3BlLnJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgJHNjb3BlLmFkZFVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvdXNlcmNyZWF0ZSc7XG4gICAgfTtcblxuICAgIHJlZnJlc2goKTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignVXNlclBhc3N3b3JkQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRyb3V0ZVBhcmFtcycsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJHJvdXRlUGFyYW1zLCAkbG9jYXRpb24sIENsaWVudCkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUuYWN0aXZlID0gZmFsc2U7XG4gICAgJHNjb3BlLmN1cnJlbnRQYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS5uZXdQYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS5yZXBlYXRQYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MgPSB7fTtcblxuICAgICRzY29wZS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MuY3VycmVudFBhc3N3b3JkID0gJyc7XG4gICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MubmV3UGFzc3dvcmQgPSAnJztcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5yZXBlYXRQYXNzd29yZCA9ICcnO1xuXG4gICAgICAgIGlmICgkc2NvcGUubmV3UGFzc3dvcmQgIT09ICRzY29wZS5yZXBlYXRQYXNzd29yZCkge1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0UmVwZWF0UGFzc3dvcmQnKS5mb2N1cygpO1xuICAgICAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5yZXBlYXRQYXNzd29yZCA9ICdoYXMtZXJyb3InO1xuICAgICAgICAgICAgJHNjb3BlLnJlcGVhdFBhc3N3b3JkID0gJyc7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAkc2NvcGUuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgQ2xpZW50LmNoYW5nZVBhc3N3b3JkKCRzY29wZS5jdXJyZW50UGFzc3dvcmQsICRzY29wZS5uZXdQYXNzd29yZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAzKSB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0Q3VycmVudFBhc3N3b3JkJykuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLmN1cnJlbnRQYXNzd29yZCA9ICdoYXMtZXJyb3InO1xuICAgICAgICAgICAgICAgICRzY29wZS5jdXJyZW50UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICAkc2NvcGUubmV3UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICAkc2NvcGUucmVwZWF0UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gY2hhbmdlIHBhc3N3b3JkLicsIGVycm9yKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2luZG93Lmhpc3RvcnkuYmFjaygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkc2NvcGUuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuY2FuY2VsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgfTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dEN1cnJlbnRQYXNzd29yZCcpLmZvY3VzKCk7XG59XSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=