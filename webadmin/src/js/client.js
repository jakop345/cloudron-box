'use strict';

/* global angular */
/* global EventSource */

angular.module('Application').service('Client', ['$http', 'md5', 'Notification', function ($http, md5, Notification) {
    var client = null;

    function ClientError(statusCode, messageOrObject) {
        Error.call(this);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        if (messageOrObject === null || typeof messageOrObject === 'undefined') {
            this.message = 'Empty message or object';
        } else if (typeof messageOrObject === 'string') {
            this.message = messageOrObject;
        } else if (messageOrObject.message) {
            this.message = messageOrObject.message;
        } else {
            this.message = JSON.stringify(messageOrObject);
        }
    }

    function defaultErrorHandler(callback) {
        return function (data, status) {
            if (status === 401) return client.login();
            if (status === 503) {
                // this could indicate a update/upgrade/restore/migration
                client.progress(function (error, result) {
                    if (error) {
                        client.error(error);
                        return callback(new ClientError(status, data));
                    }

                    if (result.update && result.update.percent !== -1) window.location.href = '/update.html';
                    else callback(new ClientError(status, data));
                }, function (data, status) {
                    client.error(data);
                    return callback(new ClientError(status, data));
                });
                return;
            }
            if (status >= 500) {
                client.error(data);
                return callback(new ClientError(status, data));
            }

            var obj = data;
            try {
                obj = JSON.parse(data);
            } catch (e) {}
            callback(new ClientError(status, obj));
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
        this._config = {
            apiServerOrigin: null,
            webServerOrigin: null,
            fqdn: null,
            ip: null,
            revision: null,
            update: { box: null, apps: null },
            isDev: false,
            progress: {},
            isCustomDomain: false,
            developerMode: false,
            region: null,
            size: null,
            cloudronName: null
        };
        this._installedApps = [];
        this._clientId = '<%= oauth.clientId %>';
        this._clientSecret = '<%= oauth.clientSecret %>';
        this.apiOrigin = '<%= oauth.apiOrigin %>';

        this.setToken(localStorage.token);
    }

    Client.prototype.error = function (error) {
        var message = '';

        if (typeof error === 'object') {
            message = error.message || error;
        } else {
            message = error;
        }

        Notification.error({ title: 'Cloudron Error', message: message, delay: 5000 });
    };

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
        this._userInfo.gravatarHuge = 'https://www.gravatar.com/avatar/' + md5.createHash(userInfo.email.toLowerCase()) + '.jpg?s=128&d=mm';
    };

    Client.prototype.setConfig = function (config) {
        var that = this;

        angular.copy(config, this._config);

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
        $http.get(client.apiOrigin + '/api/v1/cloudron/config').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.userInfo = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/profile').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeDeveloperMode = function (enabled, password, callback) {
        var that = this;

        var data = { password: password, enabled: enabled };
        $http.post(client.apiOrigin + '/api/v1/developer', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));

            // will get overriden after polling for config, but ensures quick UI update
            that._config.developerMode = enabled;

            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeCloudronName = function (name, callback) {
        var that = this;

        var data = { name: name };
        $http.post(client.apiOrigin + '/api/v1/settings/cloudron_name', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));

            // will get overriden after polling for config, but ensures quick UI update
            that._config.cloudronName = name;

            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeCloudronAvatar = function (avatarFile, callback) {
        var fd = new FormData();
        fd.append('avatar', avatarFile);

        $http.post(client.apiOrigin + '/api/v1/settings/cloudron_avatar', fd, {
            headers: { 'Content-Type': undefined },
            transformRequest: angular.identity
        }).success(function(data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.installApp = function (id, manifest, title, config, callback) {
        var that = this;
        var data = { appStoreId: id, manifest: manifest, location: config.location, portBindings: config.portBindings, accessRestriction: config.accessRestriction, oauthProxy: config.oauthProxy };
        $http.post(client.apiOrigin + '/api/v1/apps/install', data).success(function (data, status) {
            if (status !== 202 || typeof data !== 'object') return defaultErrorHandler(callback);

            // put new app with amended title in cache
            data.manifest = { title: title };
            var icons = that.getAppIconUrls(data);
            data.iconUrl = icons.cloudron;
            data.iconUrlStore = icons.store;
            data.progress = 0;

            that._installedApps.push(data);

            callback(null, data.id);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.restoreApp = function (appId, password, callback) {
        var data = { password: password };
        $http.post(client.apiOrigin + '/api/v1/apps/' + appId + '/restore', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.uninstallApp = function (appId, password, callback) {
        var data = { password: password };
        $http.post(client.apiOrigin + '/api/v1/apps/' + appId + '/uninstall', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.configureApp = function (id, password, config, callback) {
        console.log('---', config)
        var data = { appId: id, password: password, location: config.location, portBindings: config.portBindings, accessRestriction: config.accessRestriction, oauthProxy: config.oauthProxy };
        $http.post(client.apiOrigin + '/api/v1/apps/' + id + '/configure', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.updateApp = function (id, manifest, portBindings, password, callback) {
        $http.post(client.apiOrigin + '/api/v1/apps/' + id + '/update', { manifest: manifest, password: password, portBindings: portBindings }).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.startApp = function (id, callback) {
        var data = { };
        $http.post(client.apiOrigin + '/api/v1/apps/' + id + '/start', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.stopApp = function (id, callback) {
        var data = { };
        $http.post(client.apiOrigin + '/api/v1/apps/' + id + '/stop', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.progress = function (callback, errorCallback) {
        // this is used in the defaultErrorHandler itself, and avoids a loop
        if (typeof errorCallback !== 'function') errorCallback = defaultErrorHandler(callback);

        $http.get(client.apiOrigin + '/api/v1/cloudron/progress').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(errorCallback);
    };

    Client.prototype.version = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/cloudron/status').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.isServerFirstTime = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/cloudron/status').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, !data.activated);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getBackups = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/backups').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.backups);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.backup = function (callback) {
        $http.post(client.apiOrigin + '/api/v1/backups').success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getApps = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/apps').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.apps);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getNonApprovedApps = function (callback) {
        if (!this._config.developerMode) return callback(null, []);

        $http.get(client.apiOrigin + '/api/v1/developer/apps').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.apps || []);
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

    Client.prototype.getAppLogStream = function (appId) {
        var source = new EventSource('/api/v1/apps/' + appId + '/logstream');
        return source;
    };

    Client.prototype.getAppLogUrl = function (appId) {
        return '/api/v1/apps/' + appId + '/logs?access_token=' + this._token;
    };

    Client.prototype.getAppIconUrls = function (app) {
        return {
            cloudron: this.apiOrigin + app.iconUrl + '?access_token=' + this._token,
            store: this._config.apiServerOrigin + '/api/v1/apps/' + app.appStoreId + '/versions/' + app.manifest.version + '/icon'
        };
    };

    Client.prototype.setAdmin = function (username, admin, callback) {
        var payload = {
            username: username,
            admin: admin
        };

        $http.post(client.apiOrigin + '/api/v1/users/' + username + '/admin', payload).success(function (data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createAdmin = function (username, password, email, name, setupToken, callback) {
        var payload = {
            username: username,
            password: password,
            email: email,
            name: name
        };

        var that = this;

        $http.post(client.apiOrigin + '/api/v1/cloudron/activate?setupToken=' + setupToken, payload).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));

            that.setToken(data.token);
            that.setUserInfo({ username: username, email: email, admin: true });

            callback(null, data.activated);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.listUsers = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/users').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getOAuthClients = function (callback) {
        $http.get(client.apiOrigin + '/api/v1/oauth/clients').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.clients);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.delTokensByClientId = function (id, callback) {
        $http.delete(client.apiOrigin + '/api/v1/oauth/clients/' + id + '/tokens').success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.update = function (password, callback) {
        $http.post(client.apiOrigin + '/api/v1/cloudron/update', { password: password }).success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.reboot = function (callback) {
        $http.post(client.apiOrigin + '/api/v1/cloudron/reboot', { }).success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.migrate = function (size, region, password, callback) {
        $http.post(client.apiOrigin + '/api/v1/cloudron/migrate', { size: size, region: region, password: password }).success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setCertificate = function (certificateFile, keyFile, callback) {
        console.log('will set certificate');

        var fd = new FormData();
        fd.append('certificate', certificateFile);
        fd.append('key', keyFile);

        $http.post(client.apiOrigin + '/api/v1/cloudron/certificate', fd, {
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

        $http.get(client.apiOrigin + '/api/v1/cloudron/graphs', config).success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.feedback = function (type, subject, description, callback) {
        var data = {
            type: type,
            subject: subject,
            description: description
        };

        $http.post(client.apiOrigin + '/api/v1/cloudron/feedback', data).success(function (data, status) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createUser = function (username, email, callback) {
        var data = {
            username: username,
            email: email
        };

        $http.post(client.apiOrigin + '/api/v1/users', data).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.removeUser = function (userId, password, callback) {
        var data = {
            password: password
        };

        $http({ method: 'DELETE', url: '/api/v1/users/' + userId, data: data, headers: { 'Content-Type': 'application/json' }}).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changePassword = function (currentPassword, newPassword, callback) {
        var data = {
            password: currentPassword,
            newPassword: newPassword
        };

        $http.post(client.apiOrigin + '/api/v1/users/' + this._userInfo.username + '/password', data).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeEmail = function (email, password, callback) {
        var data = {
            password: password,
            email: email
        };

        $http.put(client.apiOrigin + '/api/v1/users/' + this._userInfo.username, data).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.refreshUserInfo = function (callback) {
        var that = this;

        callback = typeof callback === 'function' ? callback : function () {};

        this.userInfo(function (error, result) {
            if (error) return callback(error);

            that.setUserInfo(result);
            callback(null);
        });
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

                var tmp = {};
                angular.copy(app, tmp);

                var icons = that.getAppIconUrls(tmp);
                tmp.iconUrl = icons.cloudron;
                tmp.iconUrlStore = icons.store;

                // extract progress percentage
                var installationProgress = tmp.installationProgress || '';
                var progress = parseInt(installationProgress.split(',')[0]);
                if (isNaN(progress)) progress = 0;
                tmp.progress = progress;

                if (found !== false) {
                    angular.copy(tmp, that._installedApps[found]);
                } else {
                    that._installedApps.push(tmp);
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

    Client.prototype.login = function () {
        this.setToken(null);
        this._userInfo = {};

        var callbackURL = window.location.protocol + '//' + window.location.host + '/login_callback.html';
        var scope = 'root,profile,apps,roleAdmin';

        // generate a state id to protect agains csrf
        var state = Math.floor((1 + Math.random()) * 0x1000000000000).toString(16).substring(1);
        window.localStorage.oauth2State = state;

        // stash for further use in login_callback
        window.localStorage.returnTo = '/' + window.location.hash;

        window.location.href = this.apiOrigin + '/api/v1/oauth/dialog/authorize?response_type=token&client_id=' + this._clientId + '&redirect_uri=' + callbackURL + '&scope=' + scope + '&state=' + state;
    };

    Client.prototype.logout = function () {
        this.setToken(null);
        this._userInfo = {};

        // logout from OAuth session
        var origin = window.location.protocol + "//" + window.location.host;
        window.location.href = this.apiOrigin + '/api/v1/session/logout?redirect=' + origin;
    };

    Client.prototype.exchangeCodeForToken = function (code, callback) {
        var data = {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: window.location.protocol + '//' + window.location.host,
            client_id: this._clientId,
            client_secret: this._clientSecret
        };

        $http.post(client.apiOrigin + '/api/v1/oauth/token?response_type=token&client_id=' + this._clientId, data).success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));

            callback(null, data.access_token);
        }).error(defaultErrorHandler(callback));
    };

    client = new Client();
    return client;
}]);
