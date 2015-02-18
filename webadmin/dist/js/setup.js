'use strict';

// create main application module
var app = angular.module('Application', ['ngAnimate', 'angular-md5']);

app.controller('SetupController', ['$scope', 'Client', function ($scope, Client) {
    $scope.initialized = false;
    $scope.busy = false;

    $scope.username = '';
    $scope.email = '';
    $scope.password = '';
    $scope.passwordRepeat = '';

    $scope.error = '';

    $scope.submit = function () {
        $scope.busy = true;
        $scope.error = '';

        Client.createAdmin($scope.username, $scope.password, $scope.email, function (error) {
            if (error) {
                $scope.error = error.message;
                console.error('Internal error', error);

                $scope.busy = false;
                return;
            }

            window.location.href = '/';
        });
    };

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            window.location.href = '/error.html';
            return;
        }

        if (!isFirstTime) {
            window.location.href = '/';
            return;
        }

        $scope.initialized = true;

        // hack for autofocus with angular
        setTimeout( function () { $('input[autofocus]:visible:first').focus(); }, 0);
    });
}]);

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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNldHVwLmpzIiwiY2xpZW50LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6InNldHVwLmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG4vLyBjcmVhdGUgbWFpbiBhcHBsaWNhdGlvbiBtb2R1bGVcbnZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnQXBwbGljYXRpb24nLCBbJ25nQW5pbWF0ZScsICdhbmd1bGFyLW1kNSddKTtcblxuYXBwLmNvbnRyb2xsZXIoJ1NldHVwQ29udHJvbGxlcicsIFsnJHNjb3BlJywgJ0NsaWVudCcsIGZ1bmN0aW9uICgkc2NvcGUsIENsaWVudCkge1xuICAgICRzY29wZS5pbml0aWFsaXplZCA9IGZhbHNlO1xuICAgICRzY29wZS5idXN5ID0gZmFsc2U7XG5cbiAgICAkc2NvcGUudXNlcm5hbWUgPSAnJztcbiAgICAkc2NvcGUuZW1haWwgPSAnJztcbiAgICAkc2NvcGUucGFzc3dvcmQgPSAnJztcbiAgICAkc2NvcGUucGFzc3dvcmRSZXBlYXQgPSAnJztcblxuICAgICRzY29wZS5lcnJvciA9ICcnO1xuXG4gICAgJHNjb3BlLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJHNjb3BlLmJ1c3kgPSB0cnVlO1xuICAgICAgICAkc2NvcGUuZXJyb3IgPSAnJztcblxuICAgICAgICBDbGllbnQuY3JlYXRlQWRtaW4oJHNjb3BlLnVzZXJuYW1lLCAkc2NvcGUucGFzc3dvcmQsICRzY29wZS5lbWFpbCwgZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAkc2NvcGUuZXJyb3IgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludGVybmFsIGVycm9yJywgZXJyb3IpO1xuXG4gICAgICAgICAgICAgICAgJHNjb3BlLmJ1c3kgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy8nO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LmlzU2VydmVyRmlyc3RUaW1lKGZ1bmN0aW9uIChlcnJvciwgaXNGaXJzdFRpbWUpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvZXJyb3IuaHRtbCc7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWlzRmlyc3RUaW1lKSB7XG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9ICcvJztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgICRzY29wZS5pbml0aWFsaXplZCA9IHRydWU7XG5cbiAgICAgICAgLy8gaGFjayBmb3IgYXV0b2ZvY3VzIHdpdGggYW5ndWxhclxuICAgICAgICBzZXRUaW1lb3V0KCBmdW5jdGlvbiAoKSB7ICQoJ2lucHV0W2F1dG9mb2N1c106dmlzaWJsZTpmaXJzdCcpLmZvY3VzKCk7IH0sIDApO1xuICAgIH0pO1xufV0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKiBnbG9iYWwgYW5ndWxhciAqL1xuLyogZ2xvYmFsIEV2ZW50U291cmNlICovXG5cbmFuZ3VsYXIubW9kdWxlKCdBcHBsaWNhdGlvbicpLnNlcnZpY2UoJ0NsaWVudCcsIGZ1bmN0aW9uICgkaHR0cCwgbWQ1KSB7XG4gICAgdmFyIGNsaWVudCA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiBDbGllbnRFcnJvcihzdGF0dXNDb2RlLCBtZXNzYWdlKSB7XG4gICAgICAgIEVycm9yLmNhbGwodGhpcyk7XG4gICAgICAgIHRoaXMubmFtZSA9IHRoaXMuY29uc3RydWN0b3IubmFtZTtcbiAgICAgICAgdGhpcy5zdGF0dXNDb2RlID0gc3RhdHVzQ29kZTtcbiAgICAgICAgaWYgKHR5cGVvZiBtZXNzYWdlID09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlID0gSlNPTi5zdHJpbmdpZnkobWVzc2FnZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzID09PSA0MDEpIHJldHVybiBjbGllbnQubG9nb3V0KCk7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gQ2xpZW50KCkge1xuICAgICAgICB0aGlzLl9yZWFkeSA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jb25maWdMaXN0ZW5lciA9IFtdO1xuICAgICAgICB0aGlzLl9yZWFkeUxpc3RlbmVyID0gW107XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IG51bGwsXG4gICAgICAgICAgICBlbWFpbDogbnVsbCxcbiAgICAgICAgICAgIGFkbWluOiBmYWxzZVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLl90b2tlbiA9IG51bGw7XG4gICAgICAgIHRoaXMuX2NsaWVudElkID0gJ2NpZC13ZWJhZG1pbic7XG4gICAgICAgIHRoaXMuX2NsaWVudFNlY3JldCA9ICd1bnVzZWQnO1xuICAgICAgICB0aGlzLl9jb25maWcgPSB7XG4gICAgICAgICAgICBhcGlTZXJ2ZXJPcmlnaW46IG51bGwsXG4gICAgICAgICAgICB3ZWJTZXJ2ZXJPcmlnaW46IG51bGwsXG4gICAgICAgICAgICBmcWRuOiBudWxsLFxuICAgICAgICAgICAgaXA6IG51bGwsXG4gICAgICAgICAgICByZXZpc2lvbjogbnVsbCxcbiAgICAgICAgICAgIHVwZGF0ZTogbnVsbCxcbiAgICAgICAgICAgIGlzRGV2OiBmYWxzZSxcbiAgICAgICAgICAgIHByb2dyZXNzOiB7fVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLl9pbnN0YWxsZWRBcHBzID0gW107XG5cbiAgICAgICAgdGhpcy5zZXRUb2tlbihsb2NhbFN0b3JhZ2UudG9rZW4pO1xuICAgIH1cblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0UmVhZHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLl9yZWFkeSkgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuX3JlYWR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5fcmVhZHlMaXN0ZW5lci5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUub25SZWFkeSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBpZiAodGhpcy5fcmVhZHkpIGNhbGxiYWNrKCk7XG4gICAgICAgIHRoaXMuX3JlYWR5TGlzdGVuZXIucHVzaChjYWxsYmFjayk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUub25Db25maWcgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgdGhpcy5fY29uZmlnTGlzdGVuZXIucHVzaChjYWxsYmFjayk7XG4gICAgICAgIGNhbGxiYWNrKHRoaXMuX2NvbmZpZyk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0VXNlckluZm8gPSBmdW5jdGlvbiAodXNlckluZm8pIHtcbiAgICAgICAgLy8gSW4gb3JkZXIgdG8ga2VlcCB0aGUgYW5ndWxhciBiaW5kaW5ncyBhbGl2ZSwgc2V0IGVhY2ggcHJvcGVydHkgaW5kaXZpZHVhbGx5XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvLnVzZXJuYW1lID0gdXNlckluZm8udXNlcm5hbWU7XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvLmVtYWlsID0gdXNlckluZm8uZW1haWw7XG4gICAgICAgIHRoaXMuX3VzZXJJbmZvLmFkbWluID0gISF1c2VySW5mby5hZG1pbjtcbiAgICAgICAgdGhpcy5fdXNlckluZm8uZ3JhdmF0YXIgPSAnaHR0cHM6Ly93d3cuZ3JhdmF0YXIuY29tL2F2YXRhci8nICsgbWQ1LmNyZWF0ZUhhc2godXNlckluZm8uZW1haWwudG9Mb3dlckNhc2UoKSkgKyAnLmpwZz9zPTI0JmQ9bW0nO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnNldENvbmZpZyA9IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgLy8gSW4gb3JkZXIgdG8ga2VlcCB0aGUgYW5ndWxhciBiaW5kaW5ncyBhbGl2ZSwgc2V0IGVhY2ggcHJvcGVydHkgaW5kaXZpZHVhbGx5IChUT0RPOiBqdXN0IHVzZSBhbmd1bGFyLmNvcHkgPylcbiAgICAgICAgdGhpcy5fY29uZmlnLmFwaVNlcnZlck9yaWdpbiA9IGNvbmZpZy5hcGlTZXJ2ZXJPcmlnaW47XG4gICAgICAgIHRoaXMuX2NvbmZpZy53ZWJTZXJ2ZXJPcmlnaW4gPSBjb25maWcud2ViU2VydmVyT3JpZ2luO1xuICAgICAgICB0aGlzLl9jb25maWcudmVyc2lvbiA9IGNvbmZpZy52ZXJzaW9uO1xuICAgICAgICB0aGlzLl9jb25maWcuZnFkbiA9IGNvbmZpZy5mcWRuO1xuICAgICAgICB0aGlzLl9jb25maWcuaXAgPSBjb25maWcuaXA7XG4gICAgICAgIHRoaXMuX2NvbmZpZy5yZXZpc2lvbiA9IGNvbmZpZy5yZXZpc2lvbjtcbiAgICAgICAgdGhpcy5fY29uZmlnLnVwZGF0ZSA9IGNvbmZpZy51cGRhdGU7XG4gICAgICAgIHRoaXMuX2NvbmZpZy5pc0RldiA9IGNvbmZpZy5pc0RldjtcbiAgICAgICAgdGhpcy5fY29uZmlnLnByb2dyZXNzID0gY29uZmlnLnByb2dyZXNzO1xuXG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICB0aGlzLl9jb25maWdMaXN0ZW5lci5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sodGhhdC5fY29uZmlnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0SW5zdGFsbGVkQXBwcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2luc3RhbGxlZEFwcHM7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0VXNlckluZm8gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl91c2VySW5mbztcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRDb25maWcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb25maWc7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0VG9rZW4gPSBmdW5jdGlvbiAodG9rZW4pIHtcbiAgICAgICAgJGh0dHAuZGVmYXVsdHMuaGVhZGVycy5jb21tb24uQXV0aG9yaXphdGlvbiA9ICdCZWFyZXIgJyArIHRva2VuO1xuICAgICAgICBpZiAoIXRva2VuKSBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgndG9rZW4nKTtcbiAgICAgICAgZWxzZSBsb2NhbFN0b3JhZ2UudG9rZW4gPSB0b2tlbjtcbiAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbjtcbiAgICB9O1xuXG4gICAgLypcbiAgICAgKiBSZXN0IEFQSSB3cmFwcGVyc1xuICAgICAqL1xuICAgIENsaWVudC5wcm90b3R5cGUuY29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9jb25maWcnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUudXNlckluZm8gPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL3Byb2ZpbGUnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuaW5zdGFsbEFwcCA9IGZ1bmN0aW9uIChpZCwgdmVyc2lvbiwgcGFzc3dvcmQsIHRpdGxlLCBjb25maWcsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcbiAgICAgICAgdmFyIGRhdGEgPSB7IGFwcFN0b3JlSWQ6IGlkLCB2ZXJzaW9uOiB2ZXJzaW9uLCBwYXNzd29yZDogcGFzc3dvcmQsIGxvY2F0aW9uOiBjb25maWcubG9jYXRpb24sIHBvcnRCaW5kaW5nczogY29uZmlnLnBvcnRCaW5kaW5ncywgYWNjZXNzUmVzdHJpY3Rpb246IGNvbmZpZy5hY2Nlc3NSZXN0cmljdGlvbiB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvaW5zdGFsbCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcblxuICAgICAgICAgICAgLy8gcHV0IG5ldyBhcHAgd2l0aCBhbWVuZGVkIHRpdGxlIGluIGNhY2hlXG4gICAgICAgICAgICBkYXRhLm1hbmlmZXN0ID0geyB0aXRsZTogdGl0bGUgfTtcbiAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMucHVzaChkYXRhKTtcblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5pZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jb25maWd1cmVBcHAgPSBmdW5jdGlvbiAoaWQsIHBhc3N3b3JkLCBjb25maWcsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0geyBhcHBJZDogaWQsIHBhc3N3b3JkOiBwYXNzd29yZCwgbG9jYXRpb246IGNvbmZpZy5sb2NhdGlvbiwgcG9ydEJpbmRpbmdzOiBjb25maWcucG9ydEJpbmRpbmdzLCBhY2Nlc3NSZXN0cmljdGlvbjogY29uZmlnLmFjY2Vzc1Jlc3RyaWN0aW9uIH07XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL2NvbmZpZ3VyZScsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS51cGRhdGVBcHAgPSBmdW5jdGlvbiAoaWQsIHZlcnNpb24sIGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvYXBwcy8nICsgaWQgKyAnL3VwZGF0ZScsIHsgdmVyc2lvbjogdmVyc2lvbiB9KS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc3RhcnRBcHAgPSBmdW5jdGlvbiAoaWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0geyB9O1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2FwcHMvJyArIGlkICsgJy9zdGFydCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zdG9wQXBwID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHsgfTtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBpZCArICcvc3RvcCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS52ZXJzaW9uID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0dXMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuaXNTZXJ2ZXJGaXJzdFRpbWUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL2Nsb3Vkcm9uL3N0YXR1cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgIWRhdGEuYWN0aXZhdGVkKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldE5ha2VkRG9tYWluID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9zZXR0aW5ncy9uYWtlZF9kb21haW4nKVxuICAgICAgICAuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YS5hcHBpZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5zZXROYWtlZERvbWFpbiA9IGZ1bmN0aW9uIChhcHBpZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9zZXR0aW5ncy9uYWtlZF9kb21haW4nLCB7IGFwcGlkOiBhcHBpZCB9KS5zdWNjZXNzKGZ1bmN0aW9uIChkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwNCkgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ2V0QXBwcyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvYXBwcycpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuYXBwcyk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHAgPSBmdW5jdGlvbiAoYXBwSWQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBhcHBGb3VuZCA9IG51bGw7XG4gICAgICAgIHRoaXMuX2luc3RhbGxlZEFwcHMuc29tZShmdW5jdGlvbiAoYXBwKSB7XG4gICAgICAgICAgICBpZiAoYXBwLmlkID09PSBhcHBJZCkge1xuICAgICAgICAgICAgICAgIGFwcEZvdW5kID0gYXBwO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChhcHBGb3VuZCkgcmV0dXJuIGNhbGxiYWNrKG51bGwsIGFwcEZvdW5kKTtcbiAgICAgICAgZWxzZSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKCdBcHAgbm90IGZvdW5kJykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlbW92ZUFwcCA9IGZ1bmN0aW9uIChhcHBJZCwgY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9hcHBzLycgKyBhcHBJZCArICcvdW5pbnN0YWxsJykuc3VjY2VzcyhmdW5jdGlvbiAoZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDIpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmdldEFwcExvZ1N0cmVhbSA9IGZ1bmN0aW9uIChhcHBJZCkge1xuICAgICAgICB2YXIgc291cmNlID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy9sb2dzdHJlYW0nKTtcbiAgICAgICAgcmV0dXJuIHNvdXJjZTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRBcHBMb2dVcmwgPSBmdW5jdGlvbiAoYXBwSWQpIHtcbiAgICAgICAgcmV0dXJuICcvYXBpL3YxL2FwcHMvJyArIGFwcElkICsgJy9sb2dzP2FjY2Vzc190b2tlbj0nICsgdGhpcy5fdG9rZW47XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0QWRtaW4gPSBmdW5jdGlvbiAodXNlcm5hbWUsIGFkbWluLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIGFkbWluOiBhZG1pblxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMvJyArIHVzZXJuYW1lICsgJy9hZG1pbicsIHBheWxvYWQpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjA0KSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5jcmVhdGVBZG1pbiA9IGZ1bmN0aW9uICh1c2VybmFtZSwgcGFzc3dvcmQsIGVtYWlsLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgcGF5bG9hZCA9IHtcbiAgICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICAgIHBhc3N3b3JkOiBwYXNzd29yZCxcbiAgICAgICAgICAgIGVtYWlsOiBlbWFpbFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2FjdGl2YXRlJywgcGF5bG9hZCkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG5cbiAgICAgICAgICAgIHRoYXQuc2V0VG9rZW4oZGF0YS50b2tlbik7XG4gICAgICAgICAgICB0aGF0LnNldFVzZXJJbmZvKHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBlbWFpbDogZW1haWwsIGFkbWluOiB0cnVlIH0pO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFjdGl2YXRlZCk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5saXN0VXNlcnMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL3VzZXJzJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMCB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnN0YXRzID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9zdGF0cycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5nZXRPQXV0aENsaWVudHMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgJGh0dHAuZ2V0KCcvYXBpL3YxL29hdXRoL2NsaWVudHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEuY2xpZW50cyk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5kZWxUb2tlbnNCeUNsaWVudElkID0gZnVuY3Rpb24gKGlkLCBjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5kZWxldGUoJy9hcGkvdjEvb2F1dGgvY2xpZW50cy8nICsgaWQgKyAnL3Rva2VucycpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vdXBkYXRlJykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLnJlYm9vdCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5nZXQoJy9hcGkvdjEvY2xvdWRyb24vcmVib290Jykuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMiB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmJhY2t1cCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAkaHR0cC5wb3N0KCcvYXBpL3YxL2Nsb3Vkcm9uL2JhY2t1cHMnKS5zdWNjZXNzKGZ1bmN0aW9uKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAyIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuc2V0Q2VydGlmaWNhdGUgPSBmdW5jdGlvbiAoY2VydGlmaWNhdGVGaWxlLCBrZXlGaWxlLCBjYWxsYmFjaykge1xuICAgICAgICBjb25zb2xlLmxvZygnd2lsbCBzZXQgY2VydGlmaWNhdGUnKTtcblxuICAgICAgICB2YXIgZmQgPSBuZXcgRm9ybURhdGEoKTtcbiAgICAgICAgZmQuYXBwZW5kKCdjZXJ0aWZpY2F0ZScsIGNlcnRpZmljYXRlRmlsZSk7XG4gICAgICAgIGZkLmFwcGVuZCgna2V5Jywga2V5RmlsZSk7XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9jbG91ZHJvbi9jZXJ0aWZpY2F0ZScsIGZkLCB7XG4gICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiB1bmRlZmluZWQgfSxcbiAgICAgICAgICAgIHRyYW5zZm9ybVJlcXVlc3Q6IGFuZ3VsYXIuaWRlbnRpdHlcbiAgICAgICAgfSkuc3VjY2VzcyhmdW5jdGlvbihkYXRhLCBzdGF0dXMpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXMgIT09IDIwMikgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuZ3JhcGhzID0gZnVuY3Rpb24gKHRhcmdldHMsIGZyb20sIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBjb25maWcgPSB7XG4gICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldHMsXG4gICAgICAgICAgICAgICAgZm9ybWF0OiAnanNvbicsXG4gICAgICAgICAgICAgICAgZnJvbTogZnJvbVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLmdldCgnL2FwaS92MS9jbG91ZHJvbi9ncmFwaHMnLCBjb25maWcpLnN1Y2Nlc3MoZnVuY3Rpb24gKGRhdGEsIHN0YXR1cykge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyAhPT0gMjAwIHx8IHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIGNhbGxiYWNrKG5ldyBDbGllbnRFcnJvcihzdGF0dXMsIGRhdGEpKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuICAgICAgICB9KS5lcnJvcihkZWZhdWx0RXJyb3JIYW5kbGVyKGNhbGxiYWNrKSk7XG4gICAgfTtcblxuICAgIENsaWVudC5wcm90b3R5cGUuY3JlYXRlVXNlciA9IGZ1bmN0aW9uICh1c2VybmFtZSwgZW1haWwsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgICAgZW1haWw6IGVtYWlsXG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS91c2VycycsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDEgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZW1vdmVVc2VyID0gZnVuY3Rpb24gKHVzZXJuYW1lLCBwYXNzd29yZCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGRhdGEgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdXNlcm5hbWUsXG4gICAgICAgICAgICBwYXNzd29yZDogcGFzc3dvcmRcbiAgICAgICAgfTtcblxuICAgICAgICAkaHR0cCh7IG1ldGhvZDogJ0RFTEVURScsIHVybDogJy9hcGkvdjEvdXNlcnMvJyArIHVzZXJuYW1lLCBkYXRhOiBkYXRhLCBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfX0pLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQpIHJldHVybiBjYWxsYmFjayhuZXcgQ2xpZW50RXJyb3Ioc3RhdHVzLCBkYXRhKSk7XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsKTtcbiAgICAgICAgfSkuZXJyb3IoZGVmYXVsdEVycm9ySGFuZGxlcihjYWxsYmFjaykpO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmNoYW5nZVBhc3N3b3JkID0gZnVuY3Rpb24gKGN1cnJlbnRQYXNzd29yZCwgbmV3UGFzc3dvcmQsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkYXRhID0ge1xuICAgICAgICAgICAgcGFzc3dvcmQ6IGN1cnJlbnRQYXNzd29yZCxcbiAgICAgICAgICAgIG5ld1Bhc3N3b3JkOiBuZXdQYXNzd29yZFxuICAgICAgICB9O1xuXG4gICAgICAgICRodHRwLnBvc3QoJy9hcGkvdjEvdXNlcnMvJyArIHRoaXMuX3VzZXJJbmZvLnVzZXJuYW1lICsgJy9wYXNzd29yZCcsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDQgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgZGF0YSk7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWZyZXNoQ29uZmlnID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcblxuICAgICAgICBjYWxsYmFjayA9IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogZnVuY3Rpb24gKCkge307XG5cbiAgICAgICAgdGhpcy5jb25maWcoZnVuY3Rpb24gKGVycm9yLCByZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNhbGxiYWNrKGVycm9yKTtcblxuICAgICAgICAgICAgdGhhdC5zZXRDb25maWcocmVzdWx0KTtcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgQ2xpZW50LnByb3RvdHlwZS5yZWZyZXNoSW5zdGFsbGVkQXBwcyA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgY2FsbGJhY2sgPSB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IGZ1bmN0aW9uICgpIHt9O1xuXG4gICAgICAgIHRoaXMuZ2V0QXBwcyhmdW5jdGlvbiAoZXJyb3IsIGFwcHMpIHtcbiAgICAgICAgICAgIGlmIChlcnJvcikgcmV0dXJuIGNhbGxiYWNrKGVycm9yKTtcblxuICAgICAgICAgICAgLy8gaW5zZXJ0IG9yIHVwZGF0ZSBuZXcgYXBwc1xuICAgICAgICAgICAgYXBwcy5mb3JFYWNoKGZ1bmN0aW9uIChhcHApIHtcbiAgICAgICAgICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhhdC5faW5zdGFsbGVkQXBwcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhhdC5faW5zdGFsbGVkQXBwc1tpXS5pZCA9PT0gYXBwLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChmb3VuZCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgYW5ndWxhci5jb3B5KGFwcCwgdGhhdC5faW5zdGFsbGVkQXBwc1tmb3VuZF0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuX2luc3RhbGxlZEFwcHMucHVzaChhcHApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBmaWx0ZXIgb3V0IG9sZCBlbnRyaWVzLCBnb2luZyBiYWNrd2FyZHMgdG8gYWxsb3cgc3BsaWNpbmdcbiAgICAgICAgICAgIGZvcih2YXIgaSA9IHRoYXQuX2luc3RhbGxlZEFwcHMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWFwcHMuc29tZShmdW5jdGlvbiAoZWxlbSkgeyByZXR1cm4gKGVsZW0uaWQgPT09IHRoYXQuX2luc3RhbGxlZEFwcHNbaV0uaWQpOyB9KSkge1xuICAgICAgICAgICAgICAgICAgICB0aGF0Ll9pbnN0YWxsZWRBcHBzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5zZXRUb2tlbihudWxsKTtcbiAgICAgICAgdGhpcy5fdXNlckluZm8gPSB7fTtcblxuICAgICAgICAvLyBsb2dvdXQgZnJvbSBPQXV0aCBzZXNzaW9uXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gJy9hcGkvdjEvc2Vzc2lvbi9sb2dvdXQnO1xuICAgIH07XG5cbiAgICBDbGllbnQucHJvdG90eXBlLmV4Y2hhbmdlQ29kZUZvclRva2VuID0gZnVuY3Rpb24gKGF1dGhDb2RlLCBjYWxsYmFjaykge1xuICAgICAgICB2YXIgZGF0YSA9IHtcbiAgICAgICAgICAgIGdyYW50X3R5cGU6ICdhdXRob3JpemF0aW9uX2NvZGUnLFxuICAgICAgICAgICAgY29kZTogYXV0aENvZGUsXG4gICAgICAgICAgICByZWRpcmVjdF91cmk6IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4sXG4gICAgICAgICAgICBjbGllbnRfaWQ6IHRoaXMuX2NsaWVudElkLFxuICAgICAgICAgICAgY2xpZW50X3NlY3JldDogdGhpcy5fY2xpZW50U2VjcmV0XG4gICAgICAgIH07XG5cbiAgICAgICAgJGh0dHAucG9zdCgnL2FwaS92MS9vYXV0aC90b2tlbj9yZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD0nICsgdGhpcy5fY2xpZW50SWQsIGRhdGEpLnN1Y2Nlc3MoZnVuY3Rpb24oZGF0YSwgc3RhdHVzKSB7XG4gICAgICAgICAgICBpZiAoc3RhdHVzICE9PSAyMDAgfHwgdHlwZW9mIGRhdGEgIT09ICdvYmplY3QnKSByZXR1cm4gY2FsbGJhY2sobmV3IENsaWVudEVycm9yKHN0YXR1cywgZGF0YSkpO1xuXG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhLmFjY2Vzc190b2tlbik7XG4gICAgICAgIH0pLmVycm9yKGRlZmF1bHRFcnJvckhhbmRsZXIoY2FsbGJhY2spKTtcbiAgICB9O1xuXG4gICAgY2xpZW50ID0gbmV3IENsaWVudCgpO1xuICAgIHJldHVybiBjbGllbnQ7XG59KTtcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==