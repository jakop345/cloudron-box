'use strict';

/* global angular */
/* global EventSource */

angular.module('Application').service('Client', ['$http', 'md5', 'Notification', function ($http, md5, Notification) {
    var client = null;

    // variable available only here to avoid this._property pattern
    var token = null;

    // Keep this in sync with docs and constants.js, docker.js
    var DEFAULT_MEMORY_LIMIT = 1024 * 1024 * 256;

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

    // XHR wrapper to set the auth header
    function get(url, config) {
        config = config || {};
        config.headers = config.headers || {};
        config.headers.Authorization = 'Bearer ' + token;

        return $http.get(client.apiOrigin + url, config);
    }

    function post(url, data, config) {
        data = data || {};
        config = config || {};
        config.headers = config.headers || {};
        config.headers.Authorization = 'Bearer ' + token;

        return $http.post(client.apiOrigin + url, data, config);
    }

    function put(url, data, config) {
        data = data || {};
        config = config || {};
        config.headers = config.headers || {};
        config.headers.Authorization = 'Bearer ' + token;

        return $http.put(client.apiOrigin + url, data, config);
    }

    function del(url, config) {
        config = config || {};
        config.headers = config.headers || {};
        config.headers.Authorization = 'Bearer ' + token;

        return $http.delete(client.apiOrigin + url, config);
    }

    function Client() {
        this._ready = false;
        this._configListener = [];
        this._readyListener = [];
        this._userInfo = {
            id: null,
            username: null,
            email: null,
            admin: false
        };
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
            memory: 0
        };
        this._installedApps = [];
        this._clientId = '<%= oauth.clientId %>';
        this._clientSecret = '<%= oauth.clientSecret %>';
        this.apiOrigin = '<%= oauth.apiOrigin %>';
        this.avatar = '';

        this.resetAvatar();

        this.setToken(localStorage.token);
    }

    Client.prototype.error = function (error) {
        var message = '';

        if (typeof error === 'object') {
            message = error.message || error;
        } else {
            message = error;
        }

        Notification.error({ title: 'Cloudron Error', message: message });
    };

    /*

    Example usage with an action:

     var actionScope = $scope.$new(true);
     actionScope.action = '/#/certs';

     Client.notify('title', 'message', true, actionScope);

    */
    Client.prototype.notify = function (title, message, persitent, type, actionScope) {
        var options = { title: title, message: message};

        if (persitent) options.delay = 'never'; // any non Number means never timeout

        if (actionScope) {
            if (typeof actionScope.action !== 'string') throw('an actionScope has to have an action url');
            options.scope = actionScope;
        }

        if (type === 'error') Notification.error(options);
        else if (type === 'success') Notification.success(options);
        else if (type === 'info') Notification.info(options);
        else throw('Invalid notification type "' + type + '"');
    };

    Client.prototype.setReady = function () {
        if (this._ready) return;

        this._ready = true;
        this._readyListener.forEach(function (callback) {
            callback();
        });

        // clear the listeners, we only callback once!
        this._readyListener = [];
    };

    Client.prototype.onReady = function (callback) {
        if (this._ready) callback();
        else this._readyListener.push(callback);
    };

    Client.prototype.onConfig = function (callback) {
        this._configListener.push(callback);
        if (this._config && this._config.apiServerOrigin) callback(this._config);
    };

    Client.prototype.resetAvatar = function () {
        this.avatar = this.apiOrigin + '/api/v1/cloudron/avatar?' + String(Math.random()).slice(2);

        var favicon = $('#favicon');
        if (favicon) favicon.attr('href', this.avatar);
    };

    Client.prototype.setUserInfo = function (userInfo) {
        // In order to keep the angular bindings alive, set each property individually
        this._userInfo.id = userInfo.id;
        this._userInfo.username = userInfo.username;
        this._userInfo.email = userInfo.email;
        this._userInfo.alternateEmail = userInfo.alternateEmail;
        this._userInfo.displayName = userInfo.displayName;
        this._userInfo.admin = !!userInfo.admin;
        this._userInfo.showTutorial = !!userInfo.showTutorial;
        this._userInfo.gravatar = 'https://www.gravatar.com/avatar/' + md5.createHash(userInfo.alternateEmail || userInfo.email) + '.jpg?s=24&d=mm';
        this._userInfo.gravatarHuge = 'https://www.gravatar.com/avatar/' + md5.createHash(userInfo.alternateEmail || userInfo.email) + '.jpg?s=128&d=mm';
    };

    Client.prototype.setConfig = function (config) {
        var that = this;

        // provide fallback to caas
        if (!config.provider) config.provider = 'caas';

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

    Client.prototype.setToken = function (accessToken) {
        if (!accessToken) localStorage.removeItem('token');
        else localStorage.token = accessToken;

        // set the token closure
        token = accessToken;
    };

    /*
     * Rest API wrappers
     */
    Client.prototype.config = function (callback) {
        get('/api/v1/cloudron/config').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.userInfo = function (callback) {
        get('/api/v1/profile').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeDeveloperMode = function (enabled, password, callback) {
        var that = this;

        var data = { password: password, enabled: enabled };
        post('/api/v1/developer', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));

            // will get overriden after polling for config, but ensures quick UI update
            that._config.developerMode = enabled;

            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeCloudronAvatar = function (avatarFile, callback) {
        var fd = new FormData();
        fd.append('avatar', avatarFile);

        post('/api/v1/settings/cloudron_avatar', fd, {
            headers: { 'Content-Type': undefined },
            transformRequest: angular.identity
        }).success(function(data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changeCloudronName = function (name, callback) {
        var data = {
            name: name
        };

        post('/api/v1/settings/cloudron_name', data).success(function(data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.installApp = function (id, manifest, title, config, callback) {
        var that = this;
        var data = {
            appStoreId: id + '@' + manifest.version,
            location: config.location,
            portBindings: config.portBindings,
            accessRestriction: config.accessRestriction,
            cert: config.cert,
            key: config.key,
            oauthProxy: config.oauthProxy
        };

        post('/api/v1/apps/install', data).success(function (data, status) {
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

    Client.prototype.restoreApp = function (appId, backupId, password, callback) {
        var data = { password: password, backupId: backupId };
        post('/api/v1/apps/' + appId + '/restore', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.uninstallApp = function (appId, password, callback) {
        var data = { password: password };
        post('/api/v1/apps/' + appId + '/uninstall', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.configureApp = function (id, password, config, callback) {
        var data = {
            appId: id,
            password: password,
            location: config.location,
            portBindings: config.portBindings,
            accessRestriction: config.accessRestriction,
            cert: config.cert,
            key: config.key,
            memoryLimit: config.memoryLimit,
            altDomain: config.altDomain || null,
            xFrameOptions: config.xFrameOptions,
            oauthProxy: config.oauthProxy
        };

        post('/api/v1/apps/' + id + '/configure', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.updateApp = function (id, manifest, portBindings, password, callback) {
        var data =  {
            appStoreId: manifest.id + '@' + manifest.version,
            password: password,
            portBindings: portBindings
        };

        post('/api/v1/apps/' + id + '/update', data).success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.startApp = function (id, callback) {
        post('/api/v1/apps/' + id + '/start').success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.stopApp = function (id, callback) {
        post('/api/v1/apps/' + id + '/stop').success(function (data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.progress = function (callback, errorCallback) {
        // this is used in the defaultErrorHandler itself, and avoids a loop
        if (typeof errorCallback !== 'function') errorCallback = defaultErrorHandler(callback);

        get('/api/v1/cloudron/progress').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(errorCallback);
    };

    Client.prototype.version = function (callback) {
        get('/api/v1/cloudron/status').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getStatus = function (callback) {
        get('/api/v1/cloudron/status').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setBackupConfig = function (backupConfig, callback) {
        post('/api/v1/settings/backup_config', backupConfig).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getBackupConfig = function (callback) {
        get('/api/v1/settings/backup_config').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setDnsConfig = function (dnsConfig, callback) {
        post('/api/v1/settings/dns_config', dnsConfig).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getDnsConfig = function (callback) {
        get('/api/v1/settings/dns_config').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setAppstoreConfig = function (config, callback) {
        var data = config;

        post('/api/v1/settings/appstore_config', data).success(function(data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getAppstoreConfig = function (callback) {
        get('/api/v1/settings/appstore_config').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getMailConfig = function (callback) {
        get('/api/v1/settings/mail_config').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setMailConfig = function (config, callback) {
        post('/api/v1/settings/mail_config', config).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getBackups = function (callback) {
        get('/api/v1/backups').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.backups);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.backup = function (callback) {
        post('/api/v1/backups').success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getEventLogs = function (action, search, page, perPage, callback) {
        var config = {
            params: {
                action: action,
                search: search,
                page: page,
                per_page: perPage
            }
        };

        get('/api/v1/eventlog', config).success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));

            callback(null, data.eventlogs);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getApps = function (callback) {
        get('/api/v1/apps').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.apps);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getUsers = function (callback) {
        get('/api/v1/users').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.users);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getGroups = function (callback) {
        get('/api/v1/groups').success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.groups);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setGroups = function (userId, groupIds, callback) {
        put('/api/v1/users/' + userId + '/groups', { groupIds: groupIds }).success(function (data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getGroup = function (groupId, callback) {
        get('/api/v1/groups/' + groupId).success(function (data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createGroup = function (name, callback) {
        var data = {
            name: name
        };

        post('/api/v1/groups', data).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.removeGroup = function (groupId, password, callback) {
        var config = {
            data: {
                password: password
            },
            headers: {
                'Content-Type': 'application/json'
            }
        };

        del('/api/v1/groups/' + groupId, config).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getNonApprovedApps = function (callback) {
        if (!this._config.developerMode) return callback(null, []);

        get('/api/v1/developer/apps').success(function (data, status) {
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
        var source = new EventSource(client.apiOrigin + '/api/v1/apps/' + appId + '/logstream');
        return source;
    };

    Client.prototype.getAppIconUrls = function (app) {
        return {
            cloudron: app.iconUrl ? (this.apiOrigin + app.iconUrl + '?access_token=' + token) : null,
            store: app.appStoreId ? (this._config.apiServerOrigin + '/api/v1/apps/' + app.appStoreId + '/versions/' + app.manifest.version + '/icon') : null
        };
    };

    Client.prototype.sendInvite = function (user, callback) {
        post('/api/v1/users/' + user.id + '/invite').success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.resetToken);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createAdmin = function (username, password, email, displayName, setupToken, callback) {
        var that = this;

        var data = {
            username: username,
            password: password,
            email: email,
            displayName: displayName
        };

        post('/api/v1/cloudron/activate?setupToken=' + setupToken, data).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));

            that.setToken(data.token);
            that.setUserInfo({ username: username, email: email, admin: true });

            callback(null, data.activated);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getOAuthClients = function (callback) {
        get('/api/v1/oauth/clients').success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.clients);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createOAuthClient = function (appId, scope, redirectURI, callback) {
        var data = {
            appId: appId,
            scope: scope,
            redirectURI: redirectURI
        };

        post('/api/v1/oauth/clients', data).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data.clients);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.delOAuthClient = function (id, callback) {
        del('/api/v1/oauth/clients/' + id).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createTokenByClientId = function (id, expiresAt, callback) {
        post('/api/v1/oauth/clients/' + id + '/tokens?expiresAt=' + expiresAt).success(function(data, status) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data.token);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getTokensByClientId = function (id, callback) {
        get('/api/v1/oauth/clients/' + id + '/tokens').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.tokens);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.delTokensByClientId = function (id, callback) {
        del('/api/v1/oauth/clients/' + id + '/tokens').success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.delToken = function (clientId, tokenId, callback) {
        del('/api/v1/oauth/clients/' + clientId + '/tokens/' + tokenId).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.update = function (password, callback) {
        var data = { password: password };

        post('/api/v1/cloudron/update', data).success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.reboot = function (callback) {
        post('/api/v1/cloudron/reboot').success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.migrate = function (options, password, callback) {
        var data = options;
        data.password = password;

        post('/api/v1/cloudron/migrate', data).success(function(data, status) {
            if (status !== 202 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setCertificate = function (certificateFile, keyFile, callback) {
        var data = {
            cert: certificateFile,
            key: keyFile
        };

        post('/api/v1/settings/certificate', data).success(function(data, status) {
            if (status !== 202) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setAdminCertificate = function (certificateFile, keyFile, callback) {
        var data = {
            cert: certificateFile,
            key: keyFile
        };

        post('/api/v1/settings/admin_certificate', data).success(function(data, status) {
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

        get('/api/v1/cloudron/graphs', config).success(function (data, status) {
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

        post('/api/v1/cloudron/feedback', data).success(function (data, status) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.getAliases = function (userId, callback) {
        get('/api/v1/users/' + userId + '/aliases').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.aliases);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.setAliases = function (userId, aliases, callback) {
        var data = {
            aliases: aliases
        };

        put('/api/v1/users/' + userId + '/aliases', data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.createUser = function (username, email, displayName, sendInvite, callback) {
        var data = {
            username: username,
            email: email,
            displayName: displayName,
            invite: !!sendInvite
        };

        post('/api/v1/users', data).success(function(data, status) {
            if (status !== 201 || typeof data !== 'object') return callback(new ClientError(status, data));
            callback(null, data);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.updateUser = function (user, callback) {
        var data = {
            email: user.email,
            displayName: user.displayName
        };

        post('/api/v1/users/' + user.id, data).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.removeUser = function (userId, password, callback) {
        var config = {
            data: {
                password: password
            },
            headers: {
                'Content-Type': 'application/json'
            }
        };

        del('/api/v1/users/' + userId, config).success(function(data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.changePassword = function (currentPassword, newPassword, callback) {
        var data = {
            password: currentPassword,
            newPassword: newPassword
        };

        post('/api/v1/profile/password', data).success(function(data, status) {
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

    Client.prototype.appPostProcess = function (app) {
        // calculate the icon paths
        var icons = this.getAppIconUrls(app);
        app.iconUrl = icons.cloudron;
        app.iconUrlStore = icons.store;

        // extract progress percentage
        var installationProgress = app.installationProgress || '';
        var progress = parseInt(installationProgress.split(',')[0], 10);
        if (isNaN(progress)) progress = 0;
        app.progress = progress;
        app.message = installationProgress.replace(/.*, /,'');

        return app;
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

                that.appPostProcess(tmp);

                // only replace if the app is already known
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
        var scope = 'root,profile,apps';

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

        post('/api/v1/oauth/token?response_type=token&client_id=' + this._clientId, data).success(function(data, status) {
            if (status !== 200 || typeof data !== 'object') return callback(new ClientError(status, data));

            callback(null, data.access_token);
        }).error(defaultErrorHandler(callback));
    };

    Client.prototype.enoughResourcesAvailable = function (app) {
        var needed = app.manifest.memoryLimit || DEFAULT_MEMORY_LIMIT; // RAM+Swap
        var used = this.getInstalledApps().reduce(function (prev, cur) { return prev + (cur.memoryLimit || cur.manifest.memoryLimit || DEFAULT_MEMORY_LIMIT); }, 0);
        var roundedMemory = Math.round(this.getConfig().memory / (1024 * 1024 * 1024)) * 1024 * 1024 * 1024; // round to nearest GB
        var totalMemory = roundedMemory * 1.2; // box-setup.sh creates equal amount of swap. 1.2 factor is arbitrary
        var available = (totalMemory || 0) - used;

        console.log(needed, used, roundedMemory, totalMemory, available);

        return (available - needed) >= 0;
    };

    Client.prototype.setShowTutorial = function (show, callback) {
        var data = { showTutorial: show };

        post('/api/v1/profile/tutorial', data).success(function (data, status) {
            if (status !== 204) return callback(new ClientError(status, data));
            callback(null);
        }).error(defaultErrorHandler(callback));
    };

    client = new Client();
    return client;
}]);
