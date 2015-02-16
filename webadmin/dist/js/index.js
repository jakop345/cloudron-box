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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIiwiY2xpZW50LmpzIiwiYXBwc3RvcmUuanMiLCJtYWluLmpzIiwiYWNjb3VudC5qcyIsImFwcGNvbmZpZ3VyZS5qcyIsImFwcGRldGFpbHMuanMiLCJhcHBpbnN0YWxsLmpzIiwiZGFzaGJvYXJkLmpzIiwiZ3JhcGhzLmpzIiwic2VjdXJpdHkuanMiLCJzZXR0aW5ncy5qcyIsInVzZXJjcmVhdGUuanMiLCJ1c2VybGlzdC5qcyIsInVzZXJwYXNzd29yZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN4ZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBTDFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBTXJFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbi8qIGdsb2JhbCBhbmd1bGFyOmZhbHNlICovXG5cbi8vIGNyZWF0ZSBtYWluIGFwcGxpY2F0aW9uIG1vZHVsZVxudmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicsIFsnbmdSb3V0ZScsICduZ0FuaW1hdGUnLCAnYW5ndWxhci1tZDUnXSk7XG5cbi8vIHNldHVwIGFsbCBtYWpvciBhcHBsaWNhdGlvbiByb3V0ZXNcbmFwcC5jb25maWcoZnVuY3Rpb24gKCRyb3V0ZVByb3ZpZGVyKSB7XG4gICAgJHJvdXRlUHJvdmlkZXIud2hlbignLycsIHtcbiAgICAgICAgcmVkaXJlY3RUbzogJy9kYXNoYm9hcmQnXG4gICAgfSkud2hlbignL2Rhc2hib2FyZCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0Rhc2hib2FyZENvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2Rhc2hib2FyZC5odG1sJ1xuICAgIH0pLndoZW4oJy91c2VyY3JlYXRlJywge1xuICAgICAgICBjb250cm9sbGVyOiAnVXNlckNyZWF0ZUNvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL3VzZXJjcmVhdGUuaHRtbCdcbiAgICB9KS53aGVuKCcvdXNlcnBhc3N3b3JkJywge1xuICAgICAgICBjb250cm9sbGVyOiAnVXNlclBhc3N3b3JkQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvdXNlcnBhc3N3b3JkLmh0bWwnXG4gICAgfSkud2hlbignL3VzZXJsaXN0Jywge1xuICAgICAgICBjb250cm9sbGVyOiAnVXNlckxpc3RDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy91c2VybGlzdC5odG1sJ1xuICAgIH0pLndoZW4oJy9hcHBzdG9yZScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FwcFN0b3JlQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvYXBwc3RvcmUuaHRtbCdcbiAgICB9KS53aGVuKCcvYXBwLzphcHBTdG9yZUlkL2luc3RhbGwnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdBcHBJbnN0YWxsQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvYXBwaW5zdGFsbC5odG1sJ1xuICAgIH0pLndoZW4oJy9hcHAvOmFwcElkL2NvbmZpZ3VyZScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FwcENvbmZpZ3VyZUNvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2FwcGNvbmZpZ3VyZS5odG1sJ1xuICAgIH0pLndoZW4oJy9hcHAvOmFwcElkL2RldGFpbHMnLCB7XG4gICAgICAgIGNvbnRyb2xsZXI6ICdBcHBEZXRhaWxzQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3MvYXBwZGV0YWlscy5odG1sJ1xuICAgIH0pLndoZW4oJy9zZXR0aW5ncycsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1NldHRpbmdzQ29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3Mvc2V0dGluZ3MuaHRtbCdcbiAgICB9KS53aGVuKCcvYWNjb3VudCcsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0FjY291bnRDb250cm9sbGVyJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICd2aWV3cy9hY2NvdW50Lmh0bWwnXG4gICAgfSkud2hlbignL2dyYXBocycsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ0dyYXBoc0NvbnRyb2xsZXInLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ3ZpZXdzL2dyYXBocy5odG1sJ1xuICAgIH0pLndoZW4oJy9zZWN1cml0eScsIHtcbiAgICAgICAgY29udHJvbGxlcjogJ1NlY3VyaXR5Q29udHJvbGxlcicsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAndmlld3Mvc2VjdXJpdHkuaHRtbCdcbiAgICB9KS5vdGhlcndpc2UoeyByZWRpcmVjdFRvOiAnLyd9KTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdpbnN0YWxsYXRpb25BY3RpdmUnLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0ID09PSAnZXJyb3InKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2luc3RhbGxlZCcpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdpbnN0YWxsYXRpb25TdGF0ZUxhYmVsJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Vycm9yJykgcmV0dXJuICdFcnJvcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3N1YmRvbWFpbl9lcnJvcicpIHJldHVybiAnRXJyb3InO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdpbnN0YWxsZWQnKSByZXR1cm4gJ0luc3RhbGxlZCc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Rvd25sb2FkaW5nX2ltYWdlJykgcmV0dXJuICdEb3dubG9hZGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3BlbmRpbmdfaW5zdGFsbCcpIHJldHVybiAnSW5zdGFsbGluZyc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ3BlbmRpbmdfdW5pbnN0YWxsJykgcmV0dXJuICdVbmluc3RhbGxpbmcnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdjcmVhdGluZ19jb250YWluZXInKSByZXR1cm4gJ0NvbnRhaW5lcic7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2Rvd25sb2FkaW5nX21hbmlmZXN0JykgcmV0dXJuICdNYW5pZmVzdCc7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJ2NyZWF0aW5nX3ZvbHVtZScpIHJldHVybiAnVm9sdW1lJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncmVnaXN0ZXJpbmdfc3ViZG9tYWluJykgcmV0dXJuICdTdWJkb21haW4nO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdhbGxvY2F0ZWRfb2F1dGhfY3JlZGVudGlhbHMnKSByZXR1cm4gJ09BdXRoJztcblxuICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgfTtcbn0pO1xuXG5hcHAuZmlsdGVyKCdhY2Nlc3NSZXN0cmljdGlvbkxhYmVsJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dCA9PT0gJycpIHJldHVybiAncHVibGljJztcbiAgICAgICAgaWYgKGlucHV0ID09PSAncm9sZVVzZXInKSByZXR1cm4gJ3ByaXZhdGUnO1xuICAgICAgICBpZiAoaW5wdXQgPT09ICdyb2xlQWRtaW4nKSByZXR1cm4gJ3ByaXZhdGUgKEFkbWlucyBvbmx5KSc7XG5cbiAgICAgICAgcmV0dXJuIGlucHV0O1xuICAgIH07XG59KTtcblxuLy8gY3VzdG9tIGRpcmVjdGl2ZSBmb3IgZHluYW1pYyBuYW1lcyBpbiBmb3Jtc1xuLy8gU2VlIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjM2MTY1NzgvaXNzdWUtcmVnaXN0ZXJpbmctZm9ybS1jb250cm9sLXdpdGgtaW50ZXJwb2xhdGVkLW5hbWUjYW5zd2VyLTIzNjE3NDAxXG5hcHAuZGlyZWN0aXZlKCdsYXRlck5hbWUnLCBmdW5jdGlvbiAoKSB7ICAgICAgICAgICAgICAgICAgIC8vICgyKVxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnQScsXG4gICAgICAgIHJlcXVpcmU6IFsnP25nTW9kZWwnLCAnXj9mb3JtJ10sICAgICAgICAgICAgICAgICAgIC8vICgzKVxuICAgICAgICBsaW5rOiBmdW5jdGlvbiBwb3N0TGluayhzY29wZSwgZWxlbSwgYXR0cnMsIGN0cmxzKSB7XG4gICAgICAgICAgICBhdHRycy4kc2V0KCduYW1lJywgYXR0cnMubGF0ZXJOYW1lKTtcblxuICAgICAgICAgICAgdmFyIG1vZGVsQ3RybCA9IGN0cmxzWzBdOyAgICAgICAgICAgICAgICAgICAgICAvLyAoMylcbiAgICAgICAgICAgIHZhciBmb3JtQ3RybCAgPSBjdHJsc1sxXTsgICAgICAgICAgICAgICAgICAgICAgLy8gKDMpXG4gICAgICAgICAgICBpZiAobW9kZWxDdHJsICYmIGZvcm1DdHJsKSB7XG4gICAgICAgICAgICAgICAgbW9kZWxDdHJsLiRuYW1lID0gYXR0cnMubmFtZTsgICAgICAgICAgICAgIC8vICg0KVxuICAgICAgICAgICAgICAgIGZvcm1DdHJsLiRhZGRDb250cm9sKG1vZGVsQ3RybCk7ICAgICAgICAgICAvLyAoMilcbiAgICAgICAgICAgICAgICBzY29wZS4kb24oJyRkZXN0cm95JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBmb3JtQ3RybC4kcmVtb3ZlQ29udHJvbChtb2RlbEN0cmwpOyAgICAvLyAoNSlcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59KTsiLCIndXNlIHN0cmljdCc7XG5cbi8qIGdsb2JhbCBhbmd1bGFyICovXG4vKiBnbG9iYWwgRXZlbnRTb3VyY2UgKi9cblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuc2VydmljZSgnQ2xpZW50JywgZnVuY3Rpb24gKCRodHRwLCBtZDUpIHtcbiAgICB2YXIgY2xpZW50ID0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIENsaWVudEVycm9yKHN0YXR1c0NvZGUsIG1lc3NhZ2UpIHtcbiAgICAgICAgRXJyb3IuY2FsbCh0aGlzKTtcbiAgICAgICAgdGhpcy5uYW1lID0gdGhpcy5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgICAgICB0aGlzLnN0YXR1c0NvZGUgPSBzdGF0dXNDb2RlO1xuICAgICAgICBpZiAodHlwZW9mIG1lc3NhZ2UgPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2UgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgPT09IDQwMSkgcmV0dXJuIGNsaWVudC5sb2dvdXQoKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBDbGllbnQoKSB7XG4gICAgICAgIHRoaXMuX3JlYWR5ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyID0gW107XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIgPSBbXTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8gPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogbnVsbCxcbiAgICAgICAgICAgIGVtYWlsOiBudWxsLFxuICAgICAgICAgICAgYWRtaW46IGZhbHNlXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuX3Rva2VuID0gbnVsbDtcbiAgICAgICAgdGhpcy5fY2xpZW50SWQgPSAnY2lkLXdlYmFkbWluJztcbiAgICAgICAgdGhpcy5fY2xpZW50U2VjcmV0ID0gJ3VudXNlZCc7XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IHtcbiAgICAgICAgICAgIGFwaVNlcnZlck9yaWdpbjogbnVsbCxcbiAgICAgICAgICAgIHdlYlNlcnZlck9yaWdpbjogbnVsbCxcbiAgICAgICAgICAgIGZxZG46IG51bGwsXG4gICAgICAgICAgICBpcDogbnVsbCxcbiAgICAgICAgICAgIHJldmlzaW9uOiBudWxsLFxuICAgICAgICAgICAgdXBkYXRlOiBudWxsLFxuICAgICAgICAgICAgaXNEZXY6IGZhbHNlLFxuICAgICAgICAgICAgcHJvZ3Jlc3M6IHt9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuX2luc3RhbGxlZEFwcHMgPSBbXTtcblxuICAgICAgICB0aGlzLnNldFRva2VuKGxvY2FsU3RvcmFnZS50b2tlbik7XG4gICAgfVxuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRSZWFkeSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMuX3JlYWR5KSByZXR1cm47XG5cbiAgICAgICAgdGhpcy5fcmVhZHkgPSB0cnVlO1xuICAgICAgICB0aGlzLl9yZWFkeUxpc3RlbmVyLmZvckVhY2goZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5vblJlYWR5ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZWFkeSkgY2FsbGJhY2soKTtcbiAgICAgICAgdGhpcy5fcmVhZHlMaXN0ZW5lci5wdXNoKGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5vbkNvbmZpZyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB0aGlzLl9jb25maWdMaXN0ZW5lci5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgY2FsbGJhY2sodGhpcy5fY29uZmlnKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRVc2VySW5mbyA9IGZ1bmN0aW9uICh1c2VySW5mbykge1xuICAgICAgICAvLyBJbiBvcmRlciB0byBrZWVwIHRoZSBhbmd1bGFyIGJpbmRpbmdzIGFsaXZlLCBzZXQgZWFjaCBwcm9wZXJ0eSBpbmRpdmlkdWFsbHlcbiAgICAgICAgdGhpcy5fdXNlckluZm8udXNlcm5hbWUgPSB1c2VySW5mby51c2VybmFtZTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8uZW1haWwgPSB1c2VySW5mby5lbWFpbDtcbiAgICAgICAgdGhpcy5fdXNlckluZm8uYWRtaW4gPSAhIXVzZXJJbmZvLmFkbWluO1xuICAgICAgICB0aGlzLl91c2VySW5mby5ncmF2YXRhciA9ICdodHRwczovL3d3dy5ncmF2YXRhci5jb20vYXZhdGFyLycgKyBtZDUuY3JlYXRlSGFzaCh1c2VySW5mby5lbWFpbC50b0xvd2VyQ2FzZSgpKSArICcuanBnP3M9MjQmZD1tbSc7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0Q29uZmlnID0gZnVuY3Rpb24gKGNvbmZpZykge1xuICAgICAgICAvLyBJbiBvcmRlciB0byBrZWVwIHRoZSBhbmd1bGFyIGJpbmRpbmdzIGFsaXZlLCBzZXQgZWFjaCBwcm9wZXJ0eSBpbmRpdmlkdWFsbHkgKFRPRE86IGp1c3QgdXNlIGFuZ3VsYXIuY29weSA/KVxuICAgICAgICB0aGlzLl9jb25maWcuYXBpU2VydmVyT3JpZ2luID0gY29uZmlnLmFwaVNlcnZlck9yaWdpbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLndlYlNlcnZlck9yaWdpbiA9IGNvbmZpZy53ZWJTZXJ2ZXJPcmlnaW47XG4gICAgICAgIHRoaXMuX2NvbmZpZy52ZXJzaW9uID0gY29uZmlnLnZlcnNpb247XG4gICAgICAgIHRoaXMuX2NvbmZpZy5mcWRuID0gY29uZmlnLmZxZG47XG4gICAgICAgIHRoaXMuX2NvbmZpZy5pcCA9IGNvbmZpZy5pcDtcbiAgICAgICAgdGhpcy5fY29uZmlnLnJldmlzaW9uID0gY29uZmlnLnJldmlzaW9uO1xuICAgICAgICB0aGlzLl9jb25maWcudXBkYXRlID0gY29uZmlnLnVwZGF0ZTtcbiAgICAgICAgdGhpcy5fY29uZmlnLmlzRGV2ID0gY29uZmlnLmlzRGV2O1xuICAgICAgICB0aGlzLl9jb25maWcucHJvZ3Jlc3MgPSBjb25maWcucHJvZ3Jlc3M7XG5cbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMuX2NvbmZpZ0xpc3RlbmVyLmZvckVhY2goZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBjYWxsYmFjayh0aGF0Ll9jb25maWcpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRJbnN0YWxsZWRBcHBzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faW5zdGFsbGVkQXBwcztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRVc2VySW5mbyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3VzZXJJbmZvO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldENvbmZpZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NvbmZpZztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXRUb2tlbiA9IGZ1bmN0aW9uICh0b2tlbikge1xuICAgICAgICAkaHR0cC5kZWZhdWx0cy5oZWFkZXJzLmNvbW1vbi5BdXRob3JpemF0aW9uID0gJ0JlYXJlciAnICsgdG9rZW47XG4gICAgICAgIGlmICghdG9rZW4pIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCd0b2tlbicpO1xuICAgICAgICBlbHNlIGxvY2FsU3RvcmFnZS50b2tlbiA9IHRva2VuO1xuICAgICAgICB0aGlzLl90b2tlbiA9IHRva2VuO1xuICAgIH07XG5cbiAgICAvKlxuICAgICAqIFJlc3QgQVBJIHdyYXBwZXJzXG4gICAgICovXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jb25maWcgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL2NvbmZpZycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS51c2VySW5mbyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvcHJvZmlsZScpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5pbnN0YWxsQXBwID0gZnVuY3Rpb24gKGlkLCBwYXNzd29yZCwgdGl0bGUsIGNvbmZpZywgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgZGF0YSA9IHsgYXBwU3RvcmVJZDogaWQsIHBhc3N3b3JkOiBwYXNzd29yZCwgbG9jYXRpb246IGNvbmZpZy5sb2NhdGlvbiwgcG9ydEJpbmRpbmdzOiBjb25maWcucG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogY29uZmlnLmFjY2Vzc1Jlc3RyaWN0aW9uIH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy9pbnN0YWxsJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICAvLyBwdXQgbmV3IGFwcCB3aXRoIGFtZW5kZWQgdGl0bGUgaW4gY2FjaGVcbiAgICAgICAgICAgIGRhdGEubWFuaWZlc3QgPSB7IHRpdGxlOiB0aXRsZSB9O1xuICAgICAgICAgICAgdGhhdC5faW5zdGFsbGVkQXBwcy5wdXNoKGRhdGEpO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmlkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNvbmZpZ3VyZUFwcCA9IGZ1bmN0aW9uIChpZCwgcGFzc3dvcmQsIGNvbmZpZywgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7IGFwcElkOiBpZCwgcGFzc3dvcmQ6IHBhc3N3b3JkLCBsb2NhdGlvbjogY29uZmlnLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IGNvbmZpZy5wb3J0QmluZGluZ3MsIGFjY2Vzc1Jlc3RyaWN0aW9uOiBjb25maWcuYWNjZXNzUmVzdHJpY3Rpb24gfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvY29uZmlndXJlJywgZGF0YSkuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVwZGF0ZUFwcCA9IGZ1bmN0aW9uIChpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvdXBkYXRlJywgeyB9KS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc3RhcnRBcHAgPSBmdW5jdGlvbiAoaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0geyB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy9zdGFydCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdG9wQXBwID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvc3RvcCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS52ZXJzaW9uID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0dXMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuaXNTZXJ2ZXJGaXJzdFRpbWUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3N0YXR1cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgIWRhdGEuYWN0aXZhdGVkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldE5ha2VkRG9tYWluID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9zZXR0aW5ncy9uYWtlZF9kb21haW4nKVxuICAgICAgICAuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hcHBpZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uIChhcHBpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9zZXR0aW5ncy9uYWtlZF9kb21haW4nLCB7IGFwcGlkOiBhcHBpZCB9KS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwcyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvYXBwcycpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYXBwcyk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHAgPSBmdW5jdGlvbiAoYXBwSWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBhcHBGb3VuZCA9IG51bGw7XG4gICAgICAgIHRoaXMuX2luc3RhbGxlZEFwcHMuc29tZShmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgICAgICBpZiAoYXBwLmlkID09PSBhcHBJZCkge1xuICAgICAgICAgICAgICAgIGFwcEZvdW5kID0gYXBwO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChhcHBGb3VuZCkgcmV0dXJuIGNhbGxiYWNrKG51bGwsIGFwcEZvdW5kKTtcbiAgICAgICAgZWxzZSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdBcHAgbm90IGZvdW5kJykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlbW92ZUFwcCA9IGZ1bmN0aW9uIChhcHBJZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvdW5pbnN0YWxsJykuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcExvZ1N0cmVhbSA9IGZ1bmN0aW9uIChhcHBJZCkge1xuICAgICAgICB2YXIgc291cmNlID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy9sb2dzdHJlYW0nKTtcbiAgICAgICAgcmV0dXJuIHNvdXJjZTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHBMb2dVcmwgPSBmdW5jdGlvbiAoYXBwSWQpIHtcbiAgICAgICAgcmV0dXJuICcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy9sb2dzP2FjY2Vzc190b2tlbj0nICsgdGhpcy5fdG9rZW47XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0QWRtaW4gPSBmdW5jdGlvbiAodXNlcm5hbWUsIGFkbWluLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIGFkbWluOiBhZG1pblxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMvJyArIHVzZXJuYW1lICsgJy9hZG1pbicsIHBheWxvYWQpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jcmVhdGVBZG1pbiA9IGZ1bmN0aW9uICh1c2VybmFtZSwgcGFzc3dvcmQsIGVtYWlsLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgICAgICAgIGVtYWlsOiBlbWFpbFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2FjdGl2YXRlJywgcGF5bG9hZCkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIHRoYXQuc2V0VG9rZW4oZGF0YS50b2tlbik7XG4gICAgICAgICAgICB0aGF0LnNldFVzZXJJbmZvKHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBlbWFpbDogZW1haWwsIGFkbWluOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFjdGl2YXRlZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5saXN0VXNlcnMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL3VzZXJzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnN0YXRzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRPQXV0aENsaWVudHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL29hdXRoL2NsaWVudHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuY2xpZW50cyk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5kZWxUb2tlbnNCeUNsaWVudElkID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5kZWxldGUoJy9hcGkvdjEvb2F1dGgvY2xpZW50cy8nICsgaWQgKyAnL3Rva2VucycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vdXBkYXRlJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlYm9vdCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vcmVib290Jykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmJhY2t1cCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2JhY2t1cHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0Q2VydGlmaWNhdGUgPSBmdW5jdGlvbiAoY2VydGlmaWNhdGVGaWxlLCBrZXlGaWxlLCBjYWxsYmFjaykge1xuICAgICAgICBjb25zb2xlLmxvZygnd2lsbCBzZXQgY2VydGlmaWNhdGUnKTtcblxuICAgICAgICB2YXIgZmQgPSBuZXcgRm9ybURhdGEoKTtcbiAgICAgICAgZmQuYXBwZW5kKCdjZXJ0aWZpY2F0ZScsIGNlcnRpZmljYXRlRmlsZSk7XG4gICAgICAgIGZkLmFwcGVuZCgna2V5Jywga2V5RmlsZSk7XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9jZXJ0aWZpY2F0ZScsIGZkLCB7XG4gICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiB1bmRlZmluZWQgfSxcbiAgICAgICAgICAgIHRyYW5zZm9ybVJlcXVlc3Q6IGFuZ3VsYXIuaWRlbnRpdHlcbiAgICAgICAgfSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ3JhcGhzID0gZnVuY3Rpb24gKHRhcmdldHMsIGZyb20sIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBjb25maWcgPSB7XG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldHMsXG4gICAgICAgICAgICAgICAgZm9ybWF0OiAnanNvbicsXG4gICAgICAgICAgICAgICAgZnJvbTogZnJvbVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9ncmFwaHMnLCBjb25maWcpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY3JlYXRlVXNlciA9IGZ1bmN0aW9uICh1c2VybmFtZSwgZW1haWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgICAgZW1haWw6IGVtYWlsXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS91c2VycycsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVVc2VyID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBwYXNzd29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZDogcGFzc3dvcmRcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cCh7IG1ldGhvZDogJ0RFTEVURScsIHVybDogJy9hcGkvdjEvdXNlcnMvJyArIHVzZXJuYW1lLCBkYXRhOiBkYXRhLCBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfX0pLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNoYW5nZVBhc3N3b3JkID0gZnVuY3Rpb24gKGN1cnJlbnRQYXNzd29yZCwgbmV3UGFzc3dvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgcGFzc3dvcmQ6IGN1cnJlbnRQYXNzd29yZCxcbiAgICAgICAgICAgIG5ld1Bhc3N3b3JkOiBuZXdQYXNzd29yZFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMvJyArIHRoaXMuX3VzZXJJbmZvLnVzZXJuYW1lICsgJy9wYXNzd29yZCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWZyZXNoQ29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICBjYWxsYmFjayA9IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogZnVuY3Rpb24gKCkge307XG5cbiAgICAgICAgdGhpcy5jb25maWcoZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNhbGxiYWNrKGVycm9yKTtcblxuICAgICAgICAgICAgdGhhdC5zZXRDb25maWcocmVzdWx0KTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWZyZXNoSW5zdGFsbGVkQXBwcyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgY2FsbGJhY2sgPSB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IGZ1bmN0aW9uICgpIHt9O1xuXG4gICAgICAgIHRoaXMuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNhbGxiYWNrKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gaW5zZXJ0IG9yIHVwZGF0ZSBuZXcgYXBwc1xuICAgICAgICAgICAgYXBwcy5mb3JFYWNoKGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhhdC5faW5zdGFsbGVkQXBwcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhhdC5faW5zdGFsbGVkQXBwc1tpXS5pZCA9PT0gYXBwLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChmb3VuZCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgYW5ndWxhci5jb3B5KGFwcCwgdGhhdC5faW5zdGFsbGVkQXBwc1tmb3VuZF0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMucHVzaChhcHApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IG9sZCBlbnRyaWVzLCBnb2luZyBiYWNrd2FyZHMgdG8gYWxsb3cgc3BsaWNpbmdcbiAgICAgICAgICAgIGZvcih2YXIgaSA9IHRoYXQuX2luc3RhbGxlZEFwcHMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFwcHMuc29tZShmdW5jdGlvbiAoZWxlbSkgeyByZXR1cm4gKGVsZW0uaWQgPT09IHRoYXQuX2luc3RhbGxlZEFwcHNbaV0uaWQpOyB9KSkge1xuICAgICAgICAgICAgICAgICAgICB0aGF0Ll9pbnN0YWxsZWRBcHBzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zZXRUb2tlbihudWxsKTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8gPSB7fTtcblxuICAgICAgICAvLyBsb2dvdXQgZnJvbSBPQXV0aCBzZXNzaW9uXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9hcGkvdjEvc2Vzc2lvbi9sb2dvdXQnO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmV4Y2hhbmdlQ29kZUZvclRva2VuID0gZnVuY3Rpb24gKGF1dGhDb2RlLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgICAgICAgY29kZTogYXV0aENvZGUsXG4gICAgICAgICAgICByZWRpcmVjdF91cmk6IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4sXG4gICAgICAgICAgICBjbGllbnRfaWQ6IHRoaXMuX2NsaWVudElkLFxuICAgICAgICAgICAgY2xpZW50X3NlY3JldDogdGhpcy5fY2xpZW50U2VjcmV0XG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9vYXV0aC90b2tlbj9yZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD0nICsgdGhpcy5fY2xpZW50SWQsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFjY2Vzc190b2tlbik7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgY2xpZW50ID0gbmV3IENsaWVudCgpO1xuICAgIHJldHVybiBjbGllbnQ7XG59KTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignQXBwU3RvcmVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsICdBcHBTdG9yZScsIGZ1bmN0aW9uICgkc2NvcGUsICRsb2NhdGlvbiwgQ2xpZW50LCBBcHBTdG9yZSkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUuTE9BRElORyA9IDE7XG4gICAgJHNjb3BlLkVSUk9SID0gMjtcbiAgICAkc2NvcGUuTE9BREVEID0gMztcblxuICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkxPQURJTkc7XG4gICAgJHNjb3BlLmxvYWRFcnJvciA9ICcnO1xuXG4gICAgJHNjb3BlLmFwcHMgPSBbXTtcblxuICAgICRzY29wZS5yZWZyZXNoID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBDbGllbnQucmVmcmVzaEluc3RhbGxlZEFwcHMoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUubG9hZFN0YXR1cyA9ICRzY29wZS5FUlJPUjtcbiAgICAgICAgICAgICAgICAkc2NvcGUubG9hZEVycm9yID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIEFwcFN0b3JlLmdldEFwcHMoZnVuY3Rpb24gKGVycm9yLCBhcHBzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkVSUk9SO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUubG9hZEVycm9yID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGFwcCBpbiBhcHBzKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8ICRzY29wZS5hcHBzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXBwc1thcHBdLmlkID09PSAkc2NvcGUuYXBwc1tpXS5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghZm91bmQpICRzY29wZS5hcHBzLnB1c2goYXBwc1thcHBdKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUuYXBwcy5mb3JFYWNoKGZ1bmN0aW9uIChhcHAsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChDbGllbnQuX2luc3RhbGxlZEFwcHMpIGFwcC5pbnN0YWxsZWQgPSBDbGllbnQuX2luc3RhbGxlZEFwcHMuc29tZShmdW5jdGlvbiAoYSkgeyByZXR1cm4gYS5hcHBTdG9yZUlkID09PSBhcHAuaWQ7IH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWFwcHNbYXBwLmlkXSkgJHNjb3BlLmFwcHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICRzY29wZS5sb2FkU3RhdHVzID0gJHNjb3BlLkxPQURFRDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmluc3RhbGxBcHAgPSBmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgICRsb2NhdGlvbi5wYXRoKCcvYXBwLycgKyBhcHAuaWQgKyAnL2luc3RhbGwnKTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLm9wZW5BcHAgPSBmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgQ2xpZW50Ll9pbnN0YWxsZWRBcHBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoQ2xpZW50Ll9pbnN0YWxsZWRBcHBzW2ldLmFwcFN0b3JlSWQgPT09IGFwcC5pZCkge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5vcGVuKCdodHRwczovLycgKyBDbGllbnQuX2luc3RhbGxlZEFwcHNbaV0uZnFkbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uQ29uZmlnKGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgaWYgKCFjb25maWcuYXBpU2VydmVyT3JpZ2luKSByZXR1cm47XG4gICAgICAgICRzY29wZS5yZWZyZXNoKCk7XG4gICAgfSk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ01haW5Db250cm9sbGVyJywgWyckc2NvcGUnLCAnJHJvdXRlJywgJyRpbnRlcnZhbCcsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGUsICRpbnRlcnZhbCwgQ2xpZW50KSB7XG4gICAgJHNjb3BlLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgJHNjb3BlLnVzZXJJbmZvID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLmluc3RhbGxlZEFwcHMgPSBDbGllbnQuZ2V0SW5zdGFsbGVkQXBwcygpO1xuXG4gICAgJHNjb3BlLmlzQWN0aXZlID0gZnVuY3Rpb24gKHVybCkge1xuICAgICAgICBpZiAoISRyb3V0ZS5jdXJyZW50KSByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiAkcm91dGUuY3VycmVudC4kJHJvdXRlLm9yaWdpbmFsUGF0aC5pbmRleE9mKHVybCkgPT09IDA7XG4gICAgfTtcblxuICAgICRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICRzY29wZS5pbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICAgICBDbGllbnQubG9nb3V0KCk7XG4gICAgfTtcblxuICAgICRzY29wZS5sb2dpbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGNhbGxiYWNrVVJMID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArICcvbG9naW5fY2FsbGJhY2suaHRtbCc7XG4gICAgICAgIHZhciBzY29wZSA9ICdyb290LHByb2ZpbGUsYXBwcyxyb2xlQWRtaW4nO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvYXBpL3YxL29hdXRoL2RpYWxvZy9hdXRob3JpemU/cmVzcG9uc2VfdHlwZT1jb2RlJmNsaWVudF9pZD0nICsgQ2xpZW50Ll9jbGllbnRJZCArICcmcmVkaXJlY3RfdXJpPScgKyBjYWxsYmFja1VSTCArICcmc2NvcGU9JyArIHNjb3BlO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2V0dXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9zZXR1cC5odG1sJztcbiAgICB9O1xuXG4gICAgJHNjb3BlLmVycm9yID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvZXJyb3IuaHRtbCc7XG4gICAgfTtcblxuICAgIENsaWVudC5pc1NlcnZlckZpcnN0VGltZShmdW5jdGlvbiAoZXJyb3IsIGlzRmlyc3RUaW1lKSB7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG4gICAgICAgIGlmIChpc0ZpcnN0VGltZSkgcmV0dXJuICRzY29wZS5zZXR1cCgpO1xuXG4gICAgICAgIC8vIHdlIHVzZSB0aGUgY29uZmlnIHJlcXVlc3QgYXMgYW4gaW5kaWNhdG9yIGlmIHRoZSB0b2tlbiBpcyBzdGlsbCB2YWxpZFxuICAgICAgICAvLyBUT0RPIHdlIHNob3VsZCBwcm9iYWJseSBhdHRhY2ggc3VjaCBhIGhhbmRsZXIgZm9yIGVhY2ggcmVxdWVzdCwgYXMgdGhlIHRva2VuIGNhbiBnZXQgaW52YWxpZFxuICAgICAgICAvLyBhdCBhbnkgdGltZSFcbiAgICAgICAgaWYgKGxvY2FsU3RvcmFnZS50b2tlbikge1xuICAgICAgICAgICAgQ2xpZW50LnJlZnJlc2hDb25maWcoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnN0YXR1c0NvZGUgPT09IDQwMSkgcmV0dXJuICRzY29wZS5sb2dpbigpO1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuICRzY29wZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB3ZSBhcmUgYWN0dWFsbHkgdXBkYXRlaW5nXG4gICAgICAgICAgICAgICAgaWYgKENsaWVudC5nZXRDb25maWcoKS5wcm9ncmVzcy51cGRhdGUpIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy91cGRhdGUuaHRtbCc7XG5cbiAgICAgICAgICAgICAgICBDbGllbnQudXNlckluZm8oZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gJHNjb3BlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgICAgICAgICBDbGllbnQuc2V0VXNlckluZm8ocmVzdWx0KTtcblxuICAgICAgICAgICAgICAgICAgICBDbGllbnQucmVmcmVzaEluc3RhbGxlZEFwcHMoZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybiAkc2NvcGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBraWNrIG9mZiBpbnN0YWxsZWQgYXBwcyBhbmQgY29uZmlnIHBvbGxpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWZyZXNoQXBwc1RpbWVyID0gJGludGVydmFsKENsaWVudC5yZWZyZXNoSW5zdGFsbGVkQXBwcy5iaW5kKENsaWVudCksIDIwMDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlZnJlc2hDb25maWdUaW1lciA9ICRpbnRlcnZhbChDbGllbnQucmVmcmVzaENvbmZpZy5iaW5kKENsaWVudCksIDUwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAkc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkaW50ZXJ2YWwuY2FuY2VsKHJlZnJlc2hBcHBzVGltZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRpbnRlcnZhbC5jYW5jZWwocmVmcmVzaENvbmZpZ1RpbWVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBub3cgbWFyayB0aGUgQ2xpZW50IHRvIGJlIHJlYWR5XG4gICAgICAgICAgICAgICAgICAgICAgICBDbGllbnQuc2V0UmVhZHkoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICRzY29wZS5sb2dpbigpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyB3YWl0IHRpbGwgdGhlIHZpZXcgaGFzIGxvYWRlZCB1bnRpbCBzaG93aW5nIGEgbW9kYWwgZGlhbG9nXG4gICAgQ2xpZW50Lm9uQ29uZmlnKGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgaWYgKGNvbmZpZy5wcm9ncmVzcy51cGRhdGUpIHtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy91cGRhdGUuaHRtbCc7XG4gICAgICAgIH1cbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignQWNjb3VudENvbnRyb2xsZXInLCBbJyRzY29wZScsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICAkc2NvcGUudXNlciA9IENsaWVudC5nZXRVc2VySW5mbygpO1xuICAgICRzY29wZS5jb25maWcgPSBDbGllbnQuZ2V0Q29uZmlnKCk7XG5cbiAgICAkc2NvcGUuY2hhbmdlUGFzc3dvcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICRsb2NhdGlvbi5wYXRoKCcvdXNlcnBhc3N3b3JkJyk7XG4gICAgICAgIC8vIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvdXNlcnBhc3N3b3JkJztcbiAgICB9O1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdBcHBDb25maWd1cmVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGVQYXJhbXMsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5hcHAgPSBudWxsO1xuICAgICRzY29wZS5wYXNzd29yZCA9ICcnO1xuICAgICRzY29wZS5sb2NhdGlvbiA9ICcnO1xuICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9ICcnO1xuICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICRzY29wZS5lcnJvciA9IHt9O1xuICAgICRzY29wZS5kb21haW4gPSAnJztcbiAgICAkc2NvcGUucG9ydEJpbmRpbmdzID0geyB9O1xuXG4gICAgJHNjb3BlLmNvbmZpZ3VyZUFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmVycm9yLm5hbWUgPSBudWxsO1xuICAgICAgICAkc2NvcGUuZXJyb3IucGFzc3dvcmQgPSBudWxsO1xuXG4gICAgICAgIHZhciBwb3J0QmluZGluZ3MgPSB7IH07XG4gICAgICAgIGZvciAodmFyIGNvbnRhaW5lclBvcnQgaW4gJHNjb3BlLnBvcnRCaW5kaW5ncykge1xuICAgICAgICAgICAgcG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdID0gJHNjb3BlLnBvcnRCaW5kaW5nc1tjb250YWluZXJQb3J0XS5ob3N0UG9ydDtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5jb25maWd1cmVBcHAoJHJvdXRlUGFyYW1zLmFwcElkLCAkc2NvcGUucGFzc3dvcmQsIHsgbG9jYXRpb246ICRzY29wZS5sb2NhdGlvbiwgcG9ydEJpbmRpbmdzOiBwb3J0QmluZGluZ3MsIGFjY2Vzc1Jlc3RyaWN0aW9uOiAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gfSwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAzKSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9ICdXcm9uZyBwYXNzd29yZCBwcm92aWRlZC4nO1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9ICdBcHAgd2l0aCB0aGUgbmFtZSAnICsgJHNjb3BlLmFwcC5uYW1lICsgJyBjYW5ub3QgYmUgY29uZmlndXJlZC4nO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICRzY29wZS5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlcGxhY2UoJyMvYXBwLycgKyAkcm91dGVQYXJhbXMuYXBwSWQgKyAnL2RldGFpbHMnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZG9tYWluID0gQ2xpZW50LmdldENvbmZpZygpLmZxZG47XG5cbiAgICAgICAgQ2xpZW50LmdldEFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcblxuICAgICAgICAgICAgJHNjb3BlLmFwcCA9IGFwcDtcbiAgICAgICAgICAgICRzY29wZS5sb2NhdGlvbiA9IGFwcC5sb2NhdGlvbjtcbiAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSBhcHAubWFuaWZlc3QudGNwUG9ydHM7XG4gICAgICAgICAgICAkc2NvcGUuYWNjZXNzUmVzdHJpY3Rpb24gPSBhcHAuYWNjZXNzUmVzdHJpY3Rpb247XG4gICAgICAgICAgICBmb3IgKHZhciBjb250YWluZXJQb3J0IGluICRzY29wZS5wb3J0QmluZGluZ3MpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUucG9ydEJpbmRpbmdzW2NvbnRhaW5lclBvcnRdLmhvc3RQb3J0ID0gYXBwLnBvcnRCaW5kaW5nc1tjb250YWluZXJQb3J0XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRMb2NhdGlvbicpLmZvY3VzKCk7XG59XSk7XG4iLCIvKiBnbG9iYWwgJDp0cnVlICovXG4vKiBnbG9iYWwgUmlja3NoYXc6dHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0FwcERldGFpbHNDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJGh0dHAnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkaHR0cCwgJHJvdXRlUGFyYW1zLCAkbG9jYXRpb24sIENsaWVudCkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUuYXBwID0ge307XG4gICAgJHNjb3BlLmluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgJHNjb3BlLnVwZGF0ZUF2YWlsYWJsZSA9IGZhbHNlO1xuICAgICRzY29wZS5hY3RpdmVUYWIgPSAnZGF5JztcblxuICAgICRzY29wZS5zdGFydEFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnN0YXJ0QXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnN0b3BBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIENsaWVudC5zdG9wQXBwKCRyb3V0ZVBhcmFtcy5hcHBJZCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnVwZGF0ZUFwcCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQ2xpZW50LnVwZGF0ZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5kZWxldGVBcHAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNkZWxldGVBcHBNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG5cbiAgICAgICAgQ2xpZW50LnJlbW92ZUFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJyMvJztcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHJlbmRlckNwdShhY3RpdmVUYWIsIGNwdURhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkQ3B1ID0gWyBdO1xuXG4gICAgICAgIGlmIChjcHVEYXRhICYmIGNwdURhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWRDcHUgPSBjcHVEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcblxuICAgICAgICB2YXIgY3B1R3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnQ3B1Q2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDEwMCxcbiAgICAgICAgICAgIHNlcmllczogW3tcbiAgICAgICAgICAgICAgICBjb2xvcjogJ3N0ZWVsYmx1ZScsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWRDcHUgfHwgWyBdLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdjcHUnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGNwdUdyYXBoIH0pO1xuICAgICAgICB2YXIgY3B1WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdDcHVZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5KS50b0ZpeGVkKDIpICsgJyU8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY3B1R3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTWVtb3J5KGFjdGl2ZVRhYiwgbWVtb3J5RGF0YSkge1xuICAgICAgICB2YXIgdHJhbnNmb3JtZWRNZW1vcnkgPSBbIF07XG5cbiAgICAgICAgaWYgKG1lbW9yeURhdGEgJiYgbWVtb3J5RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZE1lbW9yeSA9IG1lbW9yeURhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBtZW1vcnlHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdNZW1vcnlDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIG1pbjogMCxcbiAgICAgICAgICAgIG1heDogMiAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMmdiXG4gICAgICAgICAgICBzZXJpZXM6IFsge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZE1lbW9yeSB8fCBbIF0sXG4gICAgICAgICAgICAgICAgbmFtZTogJ21lbW9yeSdcbiAgICAgICAgICAgIH0gXVxuICAgICAgICB9ICk7XG5cbiAgICAgICAgdmFyIG1lbW9yeVhBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBtZW1vcnlHcmFwaCB9KTtcbiAgICAgICAgdmFyIG1lbW9yeVlBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuWSh7XG4gICAgICAgICAgICBncmFwaDogbWVtb3J5R3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnTWVtb3J5WUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIG1lbW9yeUhvdmVyRGV0YWlsID0gbmV3IFJpY2tzaGF3LkdyYXBoLkhvdmVyRGV0YWlsKHtcbiAgICAgICAgICAgIGdyYXBoOiBtZW1vcnlHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeS8oMTAyNCoxMDI0KSkudG9GaXhlZCgyKSArICdNQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBtZW1vcnlHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGlza0RhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkRGlzayA9IFsgXTtcblxuICAgICAgICBpZiAoZGlza0RhdGEgJiYgZGlza0RhdGEuZGF0YXBvaW50cykgdHJhbnNmb3JtZWREaXNrID0gZGlza0RhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuXG4gICAgICAgIHZhciBkaXNrR3JhcGggPSBuZXcgUmlja3NoYXcuR3JhcGgoe1xuICAgICAgICAgICAgZWxlbWVudDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignIycgKyBhY3RpdmVUYWIgKyAnRGlza0NoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAzMCAqIDEwMjQgKiAxMDI0ICogMTAyNCwgLy8gMzBnYlxuICAgICAgICAgICAgc2VyaWVzOiBbe1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnc3RlZWxibHVlJyxcbiAgICAgICAgICAgICAgICBkYXRhOiB0cmFuc2Zvcm1lZERpc2sgfHwgWyBdLFxuICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBzJ1xuICAgICAgICAgICAgfV1cbiAgICAgICAgfSApO1xuXG4gICAgICAgIHZhciBkaXNrWEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGRpc2tHcmFwaCB9KTtcbiAgICAgICAgdmFyIGRpc2tZQXhpcyA9IG5ldyBSaWNrc2hhdy5HcmFwaC5BeGlzLlkoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrWUF4aXMnKSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tIb3ZlckRldGFpbCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5Ib3ZlckRldGFpbCh7XG4gICAgICAgICAgICBncmFwaDogZGlza0dyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5LygxMDI0ICogMTAyNCkpLnRvRml4ZWQoMikgKyAnTUI8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRpc2tMZWdlbmQgPSBuZXcgUmlja3NoYXcuR3JhcGguTGVnZW5kKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza0xlZ2VuZCcpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRpc2tHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICAkc2NvcGUudXBkYXRlR3JhcGhzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY3B1VXNhZ2VUYXJnZXQgPVxuICAgICAgICAgICAgJ25vbk5lZ2F0aXZlRGVyaXZhdGl2ZSgnICtcbiAgICAgICAgICAgICAgICAnc3VtU2VyaWVzKGNvbGxlY3RkLmxvY2FsaG9zdC50YWJsZS0nICsgJHNjb3BlLmFwcC5pZCArICctY3B1LmdhdWdlLXVzZXIsJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICdjb2xsZWN0ZC5sb2NhbGhvc3QudGFibGUtJyArICRzY29wZS5hcHAuaWQgKyAnLWNwdS5nYXVnZS1zeXN0ZW0pKSc7IC8vIGFzc3VtZXMgMTAwIGppZmZpZXMgcGVyIHNlYyAoVVNFUl9IWilcblxuICAgICAgICB2YXIgbWVtb3J5VXNhZ2VUYXJnZXQgPSAnY29sbGVjdGQubG9jYWxob3N0LnRhYmxlLScgKyAkc2NvcGUuYXBwLmlkICsgJy1tZW1vcnkuZ2F1Z2UtbWF4X3VzYWdlX2luX2J5dGVzJztcblxuICAgICAgICB2YXIgZGlza1VzYWdlVGFyZ2V0ID0gJ2NvbGxlY3RkLmxvY2FsaG9zdC5maWxlY291bnQtJyArICRzY29wZS5hcHAuaWQgKyAnLWFwcGRhdGEuYnl0ZXMnO1xuXG4gICAgICAgIHZhciBhY3RpdmVUYWIgPSAkc2NvcGUuYWN0aXZlVGFiO1xuICAgICAgICB2YXIgZnJvbSA9ICctMjRob3Vycyc7XG4gICAgICAgIHN3aXRjaCAoYWN0aXZlVGFiKSB7XG4gICAgICAgIGNhc2UgJ2RheSc6IGZyb20gPSAnLTI0aG91cnMnOyBicmVhaztcbiAgICAgICAgY2FzZSAnbW9udGgnOiBmcm9tID0gJy0xbW9udGgnOyBicmVhaztcbiAgICAgICAgY2FzZSAneWVhcic6IGZyb20gPSAnLTF5ZWFyJzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6IGNvbnNvbGUubG9nKCdpbnRlcm5hbCBlcnJyb3InKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENsaWVudC5ncmFwaHMoWyBjcHVVc2FnZVRhcmdldCwgbWVtb3J5VXNhZ2VUYXJnZXQsIGRpc2tVc2FnZVRhcmdldCBdLCBmcm9tLCBmdW5jdGlvbiAoZXJyb3IsIGRhdGEpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUubG9nKGVycm9yKTtcblxuICAgICAgICAgICAgcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgZGF0YVswXSk7XG5cbiAgICAgICAgICAgIHJlbmRlck1lbW9yeShhY3RpdmVUYWIsIGRhdGFbMV0pO1xuXG4gICAgICAgICAgICByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgZGF0YVsyXSk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeShmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgQ2xpZW50LmdldEFwcCgkcm91dGVQYXJhbXMuYXBwSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjLyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAkc2NvcGUuYXBwID0gYXBwO1xuICAgICAgICAgICAgJHNjb3BlLmFwcExvZ1VybCA9IENsaWVudC5nZXRBcHBMb2dVcmwoYXBwLmlkKTtcblxuICAgICAgICAgICAgaWYgKENsaWVudC5nZXRDb25maWcoKS51cGRhdGUgJiYgQ2xpZW50LmdldENvbmZpZygpLnVwZGF0ZS5hcHBzKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnVwZGF0ZUF2YWlsYWJsZSA9IENsaWVudC5nZXRDb25maWcoKS51cGRhdGUuYXBwcy5zb21lKGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4LmFwcElkID09PSAkc2NvcGUuYXBwLmFwcFN0b3JlSWQgJiYgeC52ZXJzaW9uICE9PSAkc2NvcGUuYXBwLnZlcnNpb247XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS51cGRhdGVHcmFwaHMoKTtcblxuICAgICAgICAgICAgJHNjb3BlLmluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0FwcEluc3RhbGxDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCAnQXBwU3RvcmUnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGVQYXJhbXMsICRsb2NhdGlvbiwgQ2xpZW50LCBBcHBTdG9yZSwgJHRpbWVvdXQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLmFwcCA9IG51bGw7XG4gICAgJHNjb3BlLnBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLmxvY2F0aW9uID0gJyc7XG4gICAgJHNjb3BlLmFjY2Vzc1Jlc3RyaWN0aW9uID0gJyc7XG4gICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG4gICAgJHNjb3BlLmVycm9yID0geyB9O1xuICAgICRzY29wZS5kb21haW4gPSAnJztcbiAgICAkc2NvcGUucG9ydEJpbmRpbmdzID0geyB9O1xuICAgICRzY29wZS5ob3N0UG9ydE1pbiA9IDEwMjU7XG4gICAgJHNjb3BlLmhvc3RQb3J0TWF4ID0gOTk5OTtcblxuICAgIENsaWVudC5vblJlYWR5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmRvbWFpbiA9IENsaWVudC5nZXRDb25maWcoKS5mcWRuO1xuXG4gICAgICAgIEFwcFN0b3JlLmdldEFwcEJ5SWQoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsIGZ1bmN0aW9uIChlcnJvciwgYXBwKSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcbiAgICAgICAgICAgICRzY29wZS5hcHAgPSBhcHA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIEFwcFN0b3JlLmdldE1hbmlmZXN0KCRyb3V0ZVBhcmFtcy5hcHBTdG9yZUlkLCBmdW5jdGlvbiAoZXJyb3IsIG1hbmlmZXN0KSB7XG4gICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvciB8fCB7IH07XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHJldHVybjtcbiAgICAgICAgICAgICRzY29wZS5wb3J0QmluZGluZ3MgPSBtYW5pZmVzdC50Y3BQb3J0cztcbiAgICAgICAgICAgICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiA9IG1hbmlmZXN0LmFjY2Vzc1Jlc3RyaWN0aW9uIHx8ICcnO1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBzZXR0aW5nIGlzIHRvIG1hcCBwb3J0cyBhcyB0aGV5IGFyZSBpbiBtYW5pZmVzdFxuICAgICAgICAgICAgZm9yICh2YXIgcG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLnBvcnRCaW5kaW5nc1twb3J0XS5ob3N0UG9ydCA9IHBhcnNlSW50KHBvcnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgICRzY29wZS5pbnN0YWxsQXBwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuZXJyb3IubmFtZSA9IG51bGw7XG4gICAgICAgICRzY29wZS5lcnJvci5wYXNzd29yZCA9IG51bGw7XG5cbiAgICAgICAgdmFyIHBvcnRCaW5kaW5ncyA9IHsgfTtcbiAgICAgICAgZm9yICh2YXIgcG9ydCBpbiAkc2NvcGUucG9ydEJpbmRpbmdzKSB7XG4gICAgICAgICAgICBwb3J0QmluZGluZ3NbcG9ydF0gPSAkc2NvcGUucG9ydEJpbmRpbmdzW3BvcnRdLmhvc3RQb3J0O1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50Lmluc3RhbGxBcHAoJHJvdXRlUGFyYW1zLmFwcFN0b3JlSWQsICRzY29wZS5wYXNzd29yZCwgJHNjb3BlLmFwcC50aXRsZSwgeyBsb2NhdGlvbjogJHNjb3BlLmxvY2F0aW9uLCBwb3J0QmluZGluZ3M6IHBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246ICRzY29wZS5hY2Nlc3NSZXN0cmljdGlvbiB9LCBmdW5jdGlvbiAoZXJyb3IsIGFwcElkKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDA5KSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gJ0FwcGxpY2F0aW9uIGFscmVhZHkgZXhpc3RzLic7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLmVycm9yLnBhc3N3b3JkID0gJ1dyb25nIHBhc3N3b3JkIHByb3ZpZGVkLic7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5wYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICRzY29wZS5lcnJvci5uYW1lID0gJ0FwcCB3aXRoIHRoZSBuYW1lICcgKyAkc2NvcGUuYXBwLm5hbWUgKyAnIGNhbm5vdCBiZSBpbnN0YWxsZWQuJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZXBsYWNlKCcjL2FwcC8nICsgYXBwSWQgKyAnL2RldGFpbHMnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xuXG4gICAgLy8gaGFjayBmb3IgYXV0b2ZvY3VzIHdpdGggYW5ndWxhclxuICAgICRzY29wZS4kb24oJyR2aWV3Q29udGVudExvYWRlZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24gKCkgeyAkKCdpbnB1dFthdXRvZm9jdXNdOnZpc2libGU6Zmlyc3QnKS5mb2N1cygpOyB9LCAxMDAwKTtcbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignRGFzaGJvYXJkQ29udHJvbGxlcicsIGZ1bmN0aW9uICgpIHtcblxufSk7XG4iLCIvKiBnbG9iYWw6Umlja3NoYXc6dHJ1ZSAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ0dyYXBoc0NvbnRyb2xsZXInLCBbJyRzY29wZScsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLmFjdGl2ZVRhYiA9ICdkYXknO1xuXG4gICAgdmFyIGNwdVVzYWdlVGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoJyArXG4gICAgJ3NjYWxlKGRpdmlkZVNlcmllcygnICtcbiAgICAgICAgJ3N1bVNlcmllcyhjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXN5c3RlbSxjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LW5pY2UsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS11c2VyKSwnICtcbiAgICAgICAgJ3N1bVNlcmllcyhjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LWlkbGUsY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1zeXN0ZW0sY29sbGVjdGQubG9jYWxob3N0LmNwdS0wLmNwdS1uaWNlLGNvbGxlY3RkLmxvY2FsaG9zdC5jcHUtMC5jcHUtdXNlcixjb2xsZWN0ZC5sb2NhbGhvc3QuY3B1LTAuY3B1LXdhaXQpKSwgMTAwKSwgMCknO1xuXG4gICAgdmFyIG5ldHdvcmtVc2FnZVR4VGFyZ2V0ID0gJ3RyYW5zZm9ybU51bGwoY29sbGVjdGQubG9jYWxob3N0LmludGVyZmFjZS1ldGgwLmlmX29jdGV0cy50eCwgMCknO1xuICAgIHZhciBuZXR3b3JrVXNhZ2VSeFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5pbnRlcmZhY2UtZXRoMC5pZl9vY3RldHMucngsIDApJztcblxuICAgIHZhciBkaXNrVXNhZ2VBcHBzVXNlZFRhcmdldCA9ICd0cmFuc2Zvcm1OdWxsKGNvbGxlY3RkLmxvY2FsaG9zdC5kZi1sb29wMC5kZl9jb21wbGV4LXVzZWQsIDApJztcbiAgICB2YXIgZGlza1VzYWdlRGF0YVVzZWRUYXJnZXQgPSAndHJhbnNmb3JtTnVsbChjb2xsZWN0ZC5sb2NhbGhvc3QuZGYtbG9vcDEuZGZfY29tcGxleC11c2VkLCAwKSc7XG5cbiAgICBmdW5jdGlvbiByZW5kZXJDcHUoYWN0aXZlVGFiLCBjcHVEYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZENwdSA9IFsgXTtcblxuICAgICAgICBpZiAoY3B1RGF0YSAmJiBjcHVEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkQ3B1ID0gY3B1RGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH0gfSk7XG5cbiAgICAgICAgdmFyIGNwdUdyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ0NwdUNoYXJ0JyksXG4gICAgICAgICAgICByZW5kZXJlcjogJ2FyZWEnLFxuICAgICAgICAgICAgd2lkdGg6IDU4MCxcbiAgICAgICAgICAgIGhlaWdodDogMjUwLFxuICAgICAgICAgICAgbWluOiAwLFxuICAgICAgICAgICAgbWF4OiAxMDAsXG4gICAgICAgICAgICBzZXJpZXM6IFt7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkQ3B1LFxuICAgICAgICAgICAgICAgIG5hbWU6ICdjcHUnXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1WEF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5UaW1lKHsgZ3JhcGg6IGNwdUdyYXBoIH0pO1xuICAgICAgICB2YXIgY3B1WUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBjcHVHcmFwaCxcbiAgICAgICAgICAgIG9yaWVudGF0aW9uOiAnbGVmdCcsXG4gICAgICAgICAgICB0aWNrRm9ybWF0OiBSaWNrc2hhdy5GaXh0dXJlcy5OdW1iZXIuZm9ybWF0S01CVCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdDcHVZQXhpcycpLFxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgY3B1SG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IGNwdUdyYXBoLFxuICAgICAgICAgICAgZm9ybWF0dGVyOiBmdW5jdGlvbihzZXJpZXMsIHgsIHkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3dhdGNoID0gJzxzcGFuIGNsYXNzPVwiZGV0YWlsX3N3YXRjaFwiIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogJyArIHNlcmllcy5jb2xvciArICdcIj48L3NwYW4+JztcbiAgICAgICAgICAgICAgICB2YXIgY29udGVudCA9IHN3YXRjaCArIHNlcmllcy5uYW1lICsgXCI6IFwiICsgbmV3IE51bWJlcih5KS50b0ZpeGVkKDIpICsgJyU8YnI+JztcbiAgICAgICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY3B1R3JhcGgucmVuZGVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyTmV0d29yayhhY3RpdmVUYWIsIHR4RGF0YSwgcnhEYXRhKSB7XG4gICAgICAgIHZhciB0cmFuc2Zvcm1lZFR4ID0gWyBdLCB0cmFuc2Zvcm1lZFJ4ID0gWyBdO1xuXG4gICAgICAgIGlmICh0eERhdGEgJiYgdHhEYXRhLmRhdGFwb2ludHMpIHRyYW5zZm9ybWVkVHggPSB0eERhdGEuZGF0YXBvaW50cy5tYXAoZnVuY3Rpb24gKHBvaW50KSB7IHJldHVybiB7IHk6IHBvaW50WzBdLCB4OiBwb2ludFsxXSB9IH0pO1xuICAgICAgICBpZiAocnhEYXRhICYmIHJ4RGF0YS5kYXRhcG9pbnRzKSB0cmFuc2Zvcm1lZFJ4ID0gcnhEYXRhLmRhdGFwb2ludHMubWFwKGZ1bmN0aW9uIChwb2ludCkgeyByZXR1cm4geyB5OiBwb2ludFswXSwgeDogcG9pbnRbMV0gfSB9KTtcblxuICAgICAgICB2YXIgbmV0d29ya0dyYXBoID0gbmV3IFJpY2tzaGF3LkdyYXBoKHtcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyMnICsgYWN0aXZlVGFiICsgJ05ldHdvcmtDaGFydCcpLFxuICAgICAgICAgICAgcmVuZGVyZXI6ICdhcmVhJyxcbiAgICAgICAgICAgIHdpZHRoOiA1ODAsXG4gICAgICAgICAgICBoZWlnaHQ6IDI1MCxcbiAgICAgICAgICAgIHNlcmllczogWyB7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkVHgsXG4gICAgICAgICAgICAgICAgbmFtZTogJ3R4J1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGNvbG9yOiAnZ3JlZW4nLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkUngsXG4gICAgICAgICAgICAgICAgbmFtZTogJ3J4J1xuICAgICAgICAgICAgfSBdXG4gICAgICAgIH0gKTtcblxuICAgICAgICB2YXIgbmV0d29ya1hBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBuZXR3b3JrR3JhcGggfSk7XG4gICAgICAgIHZhciBuZXR3b3JrWUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBuZXR3b3JrR3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnTmV0d29ya1lBeGlzJyksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBuZXR3b3JrSG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IG5ldHdvcmtHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeS8xMDI0KS50b0ZpeGVkKDIpICsgJ0tCPGJyPic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldHdvcmtHcmFwaC5yZW5kZXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW5kZXJEaXNrKGFjdGl2ZVRhYiwgYXBwc1VzZWREYXRhLCBkYXRhVXNlZERhdGEpIHtcbiAgICAgICAgdmFyIHRyYW5zZm9ybWVkQXBwc1VzZWQgPSBbIF0sIHRyYW5zZm9ybWVkRGF0YVVzZWQgPSBbIF07XG5cbiAgICAgICAgaWYgKGFwcHNVc2VkRGF0YSAmJiBhcHBzVXNlZERhdGEuZGF0YXBvaW50cykge1xuICAgICAgICAgICAgdHJhbnNmb3JtZWRBcHBzVXNlZCA9IGFwcHNVc2VkRGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH07IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRhdGFVc2VkRGF0YSAmJiBkYXRhVXNlZERhdGEuZGF0YXBvaW50cykge1xuICAgICAgICAgICAgdHJhbnNmb3JtZWREYXRhVXNlZCA9IGRhdGFVc2VkRGF0YS5kYXRhcG9pbnRzLm1hcChmdW5jdGlvbiAocG9pbnQpIHsgcmV0dXJuIHsgeTogcG9pbnRbMF0sIHg6IHBvaW50WzFdIH07IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRpc2tHcmFwaCA9IG5ldyBSaWNrc2hhdy5HcmFwaCh7XG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjJyArIGFjdGl2ZVRhYiArICdEaXNrQ2hhcnQnKSxcbiAgICAgICAgICAgIHJlbmRlcmVyOiAnYXJlYScsXG4gICAgICAgICAgICB3aWR0aDogNTgwLFxuICAgICAgICAgICAgaGVpZ2h0OiAyNTAsXG4gICAgICAgICAgICBtaW46IDAsXG4gICAgICAgICAgICBtYXg6IDMwICogMTAyNCAqIDEwMjQgKiAxMDI0LCAvLyAzMGdiXG4gICAgICAgICAgICBzZXJpZXM6IFt7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdzdGVlbGJsdWUnLFxuICAgICAgICAgICAgICAgIGRhdGE6IHRyYW5zZm9ybWVkQXBwc1VzZWQsXG4gICAgICAgICAgICAgICAgbmFtZTogJ2FwcHMnXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgY29sb3I6ICdncmVlbicsXG4gICAgICAgICAgICAgICAgZGF0YTogdHJhbnNmb3JtZWREYXRhVXNlZCxcbiAgICAgICAgICAgICAgICBuYW1lOiAnZGF0YSdcbiAgICAgICAgICAgIH1dXG4gICAgICAgIH0gKTtcblxuICAgICAgICB2YXIgZGlza1hBeGlzID0gbmV3IFJpY2tzaGF3LkdyYXBoLkF4aXMuVGltZSh7IGdyYXBoOiBkaXNrR3JhcGggfSk7XG4gICAgICAgIHZhciBkaXNrWUF4aXMgPSBuZXcgUmlja3NoYXcuR3JhcGguQXhpcy5ZKHtcbiAgICAgICAgICAgIGdyYXBoOiBkaXNrR3JhcGgsXG4gICAgICAgICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAgICAgICAgdGlja0Zvcm1hdDogUmlja3NoYXcuRml4dHVyZXMuTnVtYmVyLmZvcm1hdEtNQlQsXG4gICAgICAgICAgICBlbGVtZW50OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChhY3RpdmVUYWIgKyAnRGlza1lBeGlzJyksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkaXNrSG92ZXJEZXRhaWwgPSBuZXcgUmlja3NoYXcuR3JhcGguSG92ZXJEZXRhaWwoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIGZvcm1hdHRlcjogZnVuY3Rpb24oc2VyaWVzLCB4LCB5KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN3YXRjaCA9ICc8c3BhbiBjbGFzcz1cImRldGFpbF9zd2F0Y2hcIiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6ICcgKyBzZXJpZXMuY29sb3IgKyAnXCI+PC9zcGFuPic7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRlbnQgPSBzd2F0Y2ggKyBzZXJpZXMubmFtZSArIFwiOiBcIiArIG5ldyBOdW1iZXIoeS8oMTAyNCAqIDEwMjQgKiAxMDI0KSkudG9GaXhlZCgyKSArICdHQjxicj4nO1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGlza0xlZ2VuZCA9IG5ldyBSaWNrc2hhdy5HcmFwaC5MZWdlbmQoe1xuICAgICAgICAgICAgZ3JhcGg6IGRpc2tHcmFwaCxcbiAgICAgICAgICAgIGVsZW1lbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGFjdGl2ZVRhYiArICdEaXNrTGVnZW5kJylcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGlza0dyYXBoLnJlbmRlcigpO1xuICAgIH1cblxuICAgICRzY29wZS51cGRhdGVHcmFwaHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhY3RpdmVUYWIgPSAkc2NvcGUuYWN0aXZlVGFiO1xuICAgICAgIHZhciBmcm9tID0gJy0yNGhvdXJzJztcbiAgICAgICAgc3dpdGNoIChhY3RpdmVUYWIpIHtcbiAgICAgICAgY2FzZSAnZGF5JzogZnJvbSA9ICctMjRob3Vycyc7IGJyZWFrO1xuICAgICAgICBjYXNlICdtb250aCc6IGZyb20gPSAnLTFtb250aCc7IGJyZWFrO1xuICAgICAgICBjYXNlICd5ZWFyJzogZnJvbSA9ICctMXllYXInOyBicmVhaztcbiAgICAgICAgZGVmYXVsdDogY29uc29sZS5sb2coJ2ludGVybmFsIGVycnJvcicpO1xuICAgICAgICB9XG5cbiAgICAgICAgQ2xpZW50LmdyYXBocyhbIGNwdVVzYWdlVGFyZ2V0LCBuZXR3b3JrVXNhZ2VUeFRhcmdldCwgbmV0d29ya1VzYWdlUnhUYXJnZXQsIGRpc2tVc2FnZUFwcHNVc2VkVGFyZ2V0LCBkaXNrVXNhZ2VEYXRhVXNlZFRhcmdldCBdLCBmcm9tLCBmdW5jdGlvbiAoZXJyb3IsIGRhdGEpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUubG9nKGVycm9yKTtcblxuICAgICAgICAgICAgcmVuZGVyQ3B1KGFjdGl2ZVRhYiwgZGF0YVswXSk7XG5cbiAgICAgICAgICAgIHJlbmRlck5ldHdvcmsoYWN0aXZlVGFiLCBkYXRhWzFdLCBkYXRhWzJdKTtcblxuICAgICAgICAgICAgcmVuZGVyRGlzayhhY3RpdmVUYWIsIGRhdGFbM10sIGRhdGFbNF0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uUmVhZHkoJHNjb3BlLnVwZGF0ZUdyYXBocyk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ1NlY3VyaXR5Q29udHJvbGxlcicsIFsnJHNjb3BlJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsIENsaWVudCkge1xuICAgICRzY29wZS5hY3RpdmVDbGllbnRzID0gW107XG4gICAgJHNjb3BlLnRva2VuSW5Vc2UgPSBudWxsO1xuXG4gICAgJHNjb3BlLnJlbW92ZUFjY2Vzc1Rva2VucyA9IGZ1bmN0aW9uIChjbGllbnQsIGV2ZW50KSB7XG4gICAgICAgIGNsaWVudC5fYnVzeSA9IHRydWU7XG5cbiAgICAgICAgQ2xpZW50LmRlbFRva2Vuc0J5Q2xpZW50SWQoY2xpZW50LmlkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgJChldmVudC50YXJnZXQpLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuICAgICAgICAgICAgY2xpZW50Ll9idXN5ID0gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQub25SZWFkeShmdW5jdGlvbiAoKSB7XG4gICAgICAgICRzY29wZS50b2tlbkluVXNlID0gQ2xpZW50Ll90b2tlbjtcblxuICAgICAgICBDbGllbnQuZ2V0T0F1dGhDbGllbnRzKGZ1bmN0aW9uIChlcnJvciwgYWN0aXZlQ2xpZW50cykge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICRzY29wZS5hY3RpdmVDbGllbnRzID0gYWN0aXZlQ2xpZW50cztcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLmNvbnRyb2xsZXIoJ1NldHRpbmdzQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkbG9jYXRpb24sIENsaWVudCkge1xuICAgIGlmICghQ2xpZW50LmdldFVzZXJJbmZvKCkuYWRtaW4pICRsb2NhdGlvbi5wYXRoKCcvJyk7XG5cbiAgICAkc2NvcGUudXNlciA9IENsaWVudC5nZXRVc2VySW5mbygpO1xuICAgICRzY29wZS5jb25maWcgPSBDbGllbnQuZ2V0Q29uZmlnKCk7XG4gICAgJHNjb3BlLm5ha2VkRG9tYWluQXBwID0gbnVsbDtcbiAgICAkc2NvcGUuZHJpdmVzID0gW107XG4gICAgJHNjb3BlLmNlcnRpZmljYXRlRmlsZSA9IG51bGw7XG4gICAgJHNjb3BlLmNlcnRpZmljYXRlRmlsZU5hbWUgPSAnJztcbiAgICAkc2NvcGUua2V5RmlsZSA9IG51bGw7XG4gICAgJHNjb3BlLmtleUZpbGVOYW1lID0gJyc7XG5cbiAgICAkc2NvcGUuc2V0TmFrZWREb21haW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhcHBpZCA9ICRzY29wZS5uYWtlZERvbWFpbkFwcCA/ICRzY29wZS5uYWtlZERvbWFpbkFwcC5pZCA6ICdhZG1pbic7XG5cbiAgICAgICAgQ2xpZW50LnNldE5ha2VkRG9tYWluKGFwcGlkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNldHRpbmcgbmFrZWQgZG9tYWluJywgZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmNoYW5nZVBhc3N3b3JkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjL3VzZXJwYXNzd29yZCc7XG4gICAgfTtcblxuICAgICRzY29wZS5iYWNrdXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoJyNiYWNrdXBQcm9ncmVzc01vZGFsJykubW9kYWwoJ3Nob3cnKTtcbiAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuICAgICAgICBDbGllbnQuYmFja3VwKGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gbm93IHN0YXJ0IHF1ZXJ5XG4gICAgICAgICAgICBmdW5jdGlvbiBjaGVja0lmRG9uZSgpIHtcbiAgICAgICAgICAgICAgICBDbGllbnQudmVyc2lvbihmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gd2luZG93LnNldFRpbWVvdXQoY2hlY2tJZkRvbmUsIDEwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICQoJyNiYWNrdXBQcm9ncmVzc01vZGFsJykubW9kYWwoJ2hpZGUnKTtcbiAgICAgICAgICAgICAgICAgICAgJHNjb3BlLiRwYXJlbnQuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgNTAwMCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUucmVib290ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkKCcjcmVib290TW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuICAgICAgICAkKCcjcmVib290UHJvZ3Jlc3NNb2RhbCcpLm1vZGFsKCdzaG93Jyk7XG4gICAgICAgICRzY29wZS4kcGFyZW50LmluaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgQ2xpZW50LnJlYm9vdChmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIC8vIG5vdyBzdGFydCBxdWVyeVxuICAgICAgICAgICAgZnVuY3Rpb24gY2hlY2tJZkRvbmUoKSB7XG4gICAgICAgICAgICAgICAgQ2xpZW50LnZlcnNpb24oZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHdpbmRvdy5zZXRUaW1lb3V0KGNoZWNrSWZEb25lLCAxMDAwKTtcblxuICAgICAgICAgICAgICAgICAgICAkKCcjcmVib290UHJvZ3Jlc3NNb2RhbCcpLm1vZGFsKCdoaWRlJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQod2luZG93LmxvY2F0aW9uLnJlbG9hZC5iaW5kKHdpbmRvdy5sb2NhdGlvbiwgdHJ1ZSksIDEwMDApO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjaGVja0lmRG9uZSwgNTAwMCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUudXBkYXRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkKCcjdXBkYXRlTW9kYWwnKS5tb2RhbCgnaGlkZScpO1xuXG4gICAgICAgICRzY29wZS4kcGFyZW50LmluaXRpYWxpemVkID0gZmFsc2U7XG5cbiAgICAgICAgQ2xpZW50LnVwZGF0ZShmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy91cGRhdGUuaHRtbCc7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWRDZXJ0aWZpY2F0ZScpLm9uY2hhbmdlID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICRzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmNlcnRpZmljYXRlRmlsZSA9IGV2ZW50LnRhcmdldC5maWxlc1swXTtcbiAgICAgICAgICAgICRzY29wZS5jZXJ0aWZpY2F0ZUZpbGVOYW1lID0gZXZlbnQudGFyZ2V0LmZpbGVzWzBdLm5hbWU7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaWRLZXknKS5vbmNoYW5nZSA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAkc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5rZXlGaWxlID0gZXZlbnQudGFyZ2V0LmZpbGVzWzBdO1xuICAgICAgICAgICAgJHNjb3BlLmtleUZpbGVOYW1lID0gZXZlbnQudGFyZ2V0LmZpbGVzWzBdLm5hbWU7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2V0Q2VydGlmaWNhdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdXaWxsIHNldCB0aGUgY2VydGlmaWNhdGUnKTtcblxuICAgICAgICBpZiAoISRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUpIHJldHVybiBjb25zb2xlLmxvZygnQ2VydGlmaWNhdGUgbm90IHNldCcpO1xuICAgICAgICBpZiAoISRzY29wZS5rZXlGaWxlKSByZXR1cm4gY29uc29sZS5sb2coJ0tleSBub3Qgc2V0Jyk7XG5cbiAgICAgICAgQ2xpZW50LnNldENlcnRpZmljYXRlKCRzY29wZS5jZXJ0aWZpY2F0ZUZpbGUsICRzY29wZS5rZXlGaWxlLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUubG9nKGVycm9yKTtcblxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQod2luZG93LmxvY2F0aW9uLnJlbG9hZC5iaW5kKHdpbmRvdy5sb2NhdGlvbiwgdHJ1ZSksIDMwMDApO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50Lm9uQ29uZmlnKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLnRva2VuSW5Vc2UgPSBDbGllbnQuX3Rva2VuO1xuXG4gICAgICAgIENsaWVudC5nZXRBcHBzKGZ1bmN0aW9uIChlcnJvciwgYXBwcykge1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIGFwcCBsaXN0Jyk7XG4gICAgICAgICAgICAkc2NvcGUuYXBwcyA9IGFwcHM7XG5cbiAgICAgICAgICAgIENsaWVudC5nZXROYWtlZERvbWFpbihmdW5jdGlvbiAoZXJyb3IsIGFwcGlkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgICAgICAkc2NvcGUubmFrZWREb21haW5BcHAgPSBudWxsO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgJHNjb3BlLmFwcHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCRzY29wZS5hcHBzW2ldLmlkID09PSBhcHBpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgJHNjb3BlLm5ha2VkRG9tYWluQXBwID0gJHNjb3BlLmFwcHNbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBDbGllbnQuc3RhdHMoZnVuY3Rpb24gKGVycm9yLCBzdGF0cykge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmRyaXZlcyA9IHN0YXRzLmRyaXZlcztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1dKTtcbiIsIid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ0FwcGxpY2F0aW9uJykuY29udHJvbGxlcignVXNlckNyZWF0ZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcm91dGVQYXJhbXMnLCAnJGxvY2F0aW9uJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsICRyb3V0ZVBhcmFtcywgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLmRpc2FibGVkID0gZmFsc2U7XG5cbiAgICAkc2NvcGUudXNlcm5hbWUgPSAnJztcbiAgICAkc2NvcGUuZW1haWwgPSAnJztcbiAgICAkc2NvcGUuYWxyZWFkeVRha2VuID0gJyc7XG5cbiAgICAkc2NvcGUuc3VibWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAkc2NvcGUuYWxyZWFkeVRha2VuID0gJyc7XG5cbiAgICAgICAgJHNjb3BlLmRpc2FibGVkID0gdHJ1ZTtcblxuICAgICAgICBDbGllbnQuY3JlYXRlVXNlcigkc2NvcGUudXNlcm5hbWUsICRzY29wZS5lbWFpbCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDA5KSB7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmFscmVhZHlUYWtlbiA9ICRzY29wZS51c2VybmFtZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcignVXNlcm5hbWUgYWxyZWFkeSB0YWtlbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gY3JlYXRlIHVzZXIuJywgZXJyb3IpO1xuXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcjL3VzZXJsaXN0JztcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdVc2VyTGlzdENvbnRyb2xsZXInLCBbJyRzY29wZScsICckbG9jYXRpb24nLCAnQ2xpZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGxvY2F0aW9uLCBDbGllbnQpIHtcbiAgICBpZiAoIUNsaWVudC5nZXRVc2VySW5mbygpLmFkbWluKSAkbG9jYXRpb24ucGF0aCgnLycpO1xuXG4gICAgJHNjb3BlLnJlYWR5ID0gZmFsc2U7XG4gICAgJHNjb3BlLnVzZXJzID0gW107XG4gICAgJHNjb3BlLnVzZXJJbmZvID0gQ2xpZW50LmdldFVzZXJJbmZvKCk7XG4gICAgJHNjb3BlLnVzZXJEZWxldGVGb3JtID0ge1xuICAgICAgICB1c2VybmFtZTogJycsXG4gICAgICAgIHBhc3N3b3JkOiAnJ1xuICAgIH07XG5cbiAgICAkc2NvcGUuaXNNZSA9IGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiB1c2VyLnVzZXJuYW1lID09PSBDbGllbnQuZ2V0VXNlckluZm8oKS51c2VybmFtZTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLmlzQWRtaW4gPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gISF1c2VyLmFkbWluO1xuICAgIH07XG5cbiAgICAkc2NvcGUudG9nZ2xlQWRtaW4gPSBmdW5jdGlvbiAodXNlcikge1xuICAgICAgICBDbGllbnQuc2V0QWRtaW4odXNlci51c2VybmFtZSwgIXVzZXIuYWRtaW4sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICAgICAgICAgIHVzZXIuYWRtaW4gPSAhdXNlci5hZG1pbjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5kZWxldGVVc2VyID0gZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgLy8gVE9ETyBhZGQgYnVzeSBpbmRpY2F0b3IgYW5kIGJsb2NrIGZvcm1cbiAgICAgICAgaWYgKCRzY29wZS51c2VyRGVsZXRlRm9ybS51c2VybmFtZSAhPT0gdXNlci51c2VybmFtZSkgcmV0dXJuIGNvbnNvbGUuZXJyb3IoJ1VzZXJuYW1lIGRvZXMgbm90IG1hdGNoJyk7XG5cbiAgICAgICAgQ2xpZW50LnJlbW92ZVVzZXIodXNlci51c2VybmFtZSwgJHNjb3BlLnVzZXJEZWxldGVGb3JtLnBhc3N3b3JkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDEpIHJldHVybiBjb25zb2xlLmVycm9yKCdXcm9uZyBwYXNzd29yZCcpO1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGRlbGV0ZSB1c2VyLicsIGVycm9yKTtcblxuICAgICAgICAgICAgJCgnI3VzZXJEZWxldGVNb2RhbC0nICsgdXNlci51c2VybmFtZSkubW9kYWwoJ2hpZGUnKTtcblxuICAgICAgICAgICAgcmVmcmVzaCgpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gcmVmcmVzaCgpIHtcbiAgICAgICAgQ2xpZW50Lmxpc3RVc2VycyhmdW5jdGlvbiAoZXJyb3IsIHJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY29uc29sZS5lcnJvcignVW5hYmxlIHRvIGdldCB1c2VyIGxpc3RpbmcuJywgZXJyb3IpO1xuXG4gICAgICAgICAgICAkc2NvcGUudXNlcnMgPSByZXN1bHQudXNlcnM7XG4gICAgICAgICAgICAkc2NvcGUucmVhZHkgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAkc2NvcGUuYWRkVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSAnIy91c2VyY3JlYXRlJztcbiAgICB9O1xuXG4gICAgcmVmcmVzaCgpO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5hbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nKS5jb250cm9sbGVyKCdVc2VyUGFzc3dvcmRDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICdDbGllbnQnLCBmdW5jdGlvbiAoJHNjb3BlLCAkcm91dGVQYXJhbXMsICRsb2NhdGlvbiwgQ2xpZW50KSB7XG4gICAgaWYgKCFDbGllbnQuZ2V0VXNlckluZm8oKS5hZG1pbikgJGxvY2F0aW9uLnBhdGgoJy8nKTtcblxuICAgICRzY29wZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAkc2NvcGUuY3VycmVudFBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLm5ld1Bhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLnJlcGVhdFBhc3N3b3JkID0gJyc7XG4gICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcyA9IHt9O1xuXG4gICAgJHNjb3BlLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5jdXJyZW50UGFzc3dvcmQgPSAnJztcbiAgICAgICAgJHNjb3BlLnZhbGlkYXRpb25DbGFzcy5uZXdQYXNzd29yZCA9ICcnO1xuICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLnJlcGVhdFBhc3N3b3JkID0gJyc7XG5cbiAgICAgICAgaWYgKCRzY29wZS5uZXdQYXNzd29yZCAhPT0gJHNjb3BlLnJlcGVhdFBhc3N3b3JkKSB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRSZXBlYXRQYXNzd29yZCcpLmZvY3VzKCk7XG4gICAgICAgICAgICAkc2NvcGUudmFsaWRhdGlvbkNsYXNzLnJlcGVhdFBhc3N3b3JkID0gJ2hhcy1lcnJvcic7XG4gICAgICAgICAgICAkc2NvcGUucmVwZWF0UGFzc3dvcmQgPSAnJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgICRzY29wZS5hY3RpdmUgPSB0cnVlO1xuICAgICAgICBDbGllbnQuY2hhbmdlUGFzc3dvcmQoJHNjb3BlLmN1cnJlbnRQYXNzd29yZCwgJHNjb3BlLm5ld1Bhc3N3b3JkLCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5zdGF0dXNDb2RlID09PSA0MDMpIHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXRDdXJyZW50UGFzc3dvcmQnKS5mb2N1cygpO1xuICAgICAgICAgICAgICAgICRzY29wZS52YWxpZGF0aW9uQ2xhc3MuY3VycmVudFBhc3N3b3JkID0gJ2hhcy1lcnJvcic7XG4gICAgICAgICAgICAgICAgJHNjb3BlLmN1cnJlbnRQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgICRzY29wZS5uZXdQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgICAgICRzY29wZS5yZXBlYXRQYXNzd29yZCA9ICcnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBjaGFuZ2UgcGFzc3dvcmQuJywgZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5iYWNrKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICRzY29wZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgICRzY29wZS5jYW5jZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpbmRvdy5oaXN0b3J5LmJhY2soKTtcbiAgICB9O1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0Q3VycmVudFBhc3N3b3JkJykuZm9jdXMoKTtcbn1dKTtcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==