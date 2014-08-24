'use strict';

/* global angular:false */

angular.module('YellowTent').service('Client', function ($http) {

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

    function Client() {
        this._configListener = [];
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

    Client.prototype.onConfig = function (callback) {
        this._configListener.push(callback);
        callback(this._config);
    };

    Client.prototype.setUserInfo = function (userInfo) {
        // In order to keep the angular bindings alive, set each property individually
        this._userInfo.username = userInfo.username;
        this._userInfo.email = userInfo.email;
        this._userInfo.admin = !!userInfo.admin;
    };

    Client.prototype.setConfig = function (config) {
        // In order to keep the angular bindings alive, set each property individually
        this._config.appServerUrl = config.appServerUrl;
        this._config.version = config.version;
        this._config.fqdn = config.fqdn;
        this._config.ip = config.ip;
        this._config.revision = config.revision;
        this._config.update = config.update;
        this._config.isDev = config.appServerUrl === 'https://appstore-dev.herokuapp.com' || config.appServerUrl === 'https://selfhost.io:5050';

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
        $http.defaults.headers.common.Authorization = 'Token ' + token;
        if (!token) localStorage.removeItem('token');
        else localStorage.token = token;
        this._token = token;
    };

    /*
     * Rest API wrappers
     */
    Client.prototype.config = function (callback) {
        $http.get('/api/v1/config').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.createVolume = function (name, password, callback) {
        var data = { password: password, name: name };
        $http.post('/api/v1/volume/create', data).success(function(data, status) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.deleteVolume = function (name, password, callback) {
        var data = { password: password };
        $http.post('/api/v1/volume/' + name + '/delete', data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.mount = function (name, password, callback) {
        var data = { password: password };
        $http.post('/api/v1/volume/' + name + '/mount', data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.unmount = function (name, password, callback) {
        var data = { password: password };
        $http.post('/api/v1/volume/' + name + '/unmount', data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.isMounted = function (name, callback) {
        $http.get('/api/v1/volume/' + name + '/ismounted').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.mounted);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.listVolumes = function (callback) {
        $http.get('/api/v1/volume/list').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.volumes);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.addUserToVolume = function (username, volumeId, password, callback) {
        var data = { username: username, password: password };
        $http.post('/api/v1/volume/' + volumeId + '/users', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.removeUserFromVolume = function (username, volumeId, password, callback) {
        var data = { headers: {password: password} };
        $http.delete('/api/v1/volume/' + volumeId + '/users/' + username, data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.installApp = function (id, password, config, callback) {
        var data = { app_id: id, password: password, location: config.location, portBindings: config.portBindings };
        $http.post('/api/v1/app/install', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.configureApp = function (id, password, config, callback) {
        var data = { app_id: id, password: password, location: config.location, portBindings: config.portBindings };
        $http.post('/api/v1/app/' + id + '/configure', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.startApp = function (id, callback) {
        var data = { };
        $http.post('/api/v1/app/' + id + '/start', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.stopApp = function (id, callback) {
        var data = { };
        $http.post('/api/v1/app/' + id + '/stop', data).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.version = function (callback) {
        $http.get('/api/v1/version').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.isServerFirstTime = function (callback) {
        $http.get('/api/v1/firsttime').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, !data.activated);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.getNakedDomain = function (callback) {
        $http.get('/api/v1/settings/naked_domain')
        .success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.appid);
        })
        .error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.setNakedDomain = function (appid, callback) {
        $http.post('/api/v1/settings/naked_domain', { appid: appid || '' }).success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.getApps = function (callback) {
        $http.get('/api/v1/apps').success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.apps);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
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
        $http.post('/api/v1/app/' + appId + '/uninstall').success(function (data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        }).error(function (data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.createAdmin = function (username, password, email, callback) {
        var payload = {
            username: username,
            password: password,
            email: email
        };

        var that = this;

        $http.post('/api/v1/createadmin', payload).success(function(data, status) {
            if (status !== 201) return callback(new ClientError(status, data));

            that.setToken(data.token);
            that.setUserInfo(data.userInfo);

            callback(null, data.activated);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.listUsers = function (callback) {
        $http.get('/api/v1/user/list').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.stats = function (callback) {
        $http.get('/api/v1/stats').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.update = function (callback) {
        $http.get('/api/v1/update').success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.createUser = function (username, password, email, callback) {
        var data = {
            username: username,
            password: password,
            email: email
        };

        $http.post('/api/v1/user/create', data).success(function(data, status) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.removeUser = function (username, password, callback) {
        var data = {
            username: username,
            password: password
        };

        $http.post('/api/v1/user/remove', data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.changePassword = function (currentPassword, newPassword, callback) {
        var data = {
            password: currentPassword,
            newPassword: newPassword
        };

        $http.post('/api/v1/user/password', data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.refreshConfig = function (callback) {
        var that = this;

        callback = typeof callback === 'function' ? callback : function () {};

        this.config(function (error, result) {
            if (error) {
                console.error(error);
                callback(error);
            }

            that.setConfig(result);

            callback(null);
        });
    };

    Client.prototype.refreshInstalledApps = function (callback) {
        var that = this;

        callback = typeof callback === 'function' ? callback : function () {};

        this.getApps(function (error, apps) {
            if (error) {
                console.error(error);
                return callback(error);
            }

            apps.forEach(function (app, i) {
                app.iconUrl = that._config.appServerUrl + '/api/v1/appstore/apps/' + app.id + '/icon';
                if (that._installedApps.some(function (elem) { return elem.id === app.id; })) {
                    angular.copy(app, that._installedApps[i]);
                    return;
                } else {
                    that._installedApps.push(app);
                }
            });

            that._installedApps.forEach(function (app, i) {
                if (!apps.some(function (elem) { return elem.id === app.id; })) {
                    that._installedApps.splice(i, 1);
                    return;
                }
            });

            callback(null);
        });
    };

    Client.prototype.login = function (token, callback) {
        var that = this;

        $http.defaults.headers.common.Authorization = 'Token ' + token;

        $http.get('/api/v1/user/token').success(function(data, status) {
            if (status !== 200) {
                that.setToken(null);
                return callback(new ClientError(status, data));
            }

            that.setUserInfo(data.userInfo);
            that.setToken(data.token);

            that.config(function (error, result) {
                if (error) callback(error);

                that.setConfig(result);

                callback(null, data.token);
            });
        }).error(function(data, status) {
            that.setToken(null);
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.logout = function () {
        this.setToken(null);
        this._userInfo = {};
    };

    Client.prototype.exchangeCodeForToken = function (authCode, callback) {
        var that = this;
        var data = {
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: window.location.origin,
            client_id: this._clientId,
            client_secret: this._clientSecret
        };

        $http.post('/api/v1/oauth/token?response_type=token&client_id=' + this._clientId, data).success(function(data, status) {
            if (status !== 200) return callback(new ClientError(status, data));

            that.login(data.access_token, function (error, result) {
                callback(null, data.access_token);
            });
        }).error(function(data, status) {
            callback(new ClientError(status, data));
        });
    };

    return new Client();
});
