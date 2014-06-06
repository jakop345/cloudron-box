'use strict';

/* global angular:false */

angular.module('YellowTent')
.service('Client', function ($http, $base64) {

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
        this._username = null;
        this._userInfo = null;
        this._token = null;
        this._clientId = null;
        this._clientSecret = null;

        this.setToken(localStorage.token);
    }

    Client.prototype.isAdmin = function () {
        return this._userInfo ? this._userInfo.admin : false;
    };

    Client.prototype.getUserInfo = function () {
        return this._userInfo;
    };

    Client.prototype.setToken = function (token) {
        console.debug('Set client token to ', token);
        $http.defaults.headers.common.Authorization = 'Token ' + token;
        this._token = token;
    };

    Client.prototype.token = function () {
        return this._token;
    };

    Client.prototype.setClientCredentials = function (id, secret) {
        this._clientId = id;
        this._clientSecret = secret;
    };


    /*
     * Rest API wrappers
     */
    Client.prototype.createVolume = function (name, password, callback) {
        var data = { password: password, name: name };
        $http.post('/api/v1/volume/create', data)
        .success(function(data, status, headers, config) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.deleteVolume = function (name, password, callback) {
        var data = { password: password };
        $http.post('/api/v1/volume/' + name + '/delete', data)
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.mount = function (name, password, callback) {
        var data = { password: password };
        $http.post('/api/v1/volume/' + name + '/mount', data)
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.unmount = function (name, password, callback) {
        var data = { password: password };
        $http.post('/api/v1/volume/' + name + '/unmount', data)
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.isMounted = function (name, callback) {
        $http.get('/api/v1/volume/' + name + '/ismounted')
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.mounted);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.listVolumes = function (callback) {
        $http.get('/api/v1/volume/list')
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data.volumes);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.addUserToVolume = function (username, volumeId, password, callback) {
        $http.post('/api/v1/volume/' + volumeId + '/users', { username: username, password: password })
        .success(function (data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        })
        .error(function (data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.removeUserFromVolume = function (username, volumeId, password, callback) {
        $http.delete('/api/v1/volume/' + volumeId + '/users/' + username, { headers: {password: password}})
        .success(function (data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        })
        .error(function (data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.installApp = function (id, password, config, callback) {
        $http.post('/api/v1/app/install', { app_id: id, password: password, location: config.location, portBindings: config.portBindings })
        .success(function (data, status, headers) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        })
        .error(function (data, status, headers) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.isServerAvailable = function (callback) {
        $http.get('/api/v1/version')
        .success(function(data, status, headers, config) {
            callback(null, (status === 200));
        })
        .error(function(data, status, headers, config) {
            callback(null, false);
        });
    };

    Client.prototype.isServerFirstTime = function (callback) {
        $http.get('/api/v1/firsttime')
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, !data.activated);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.createAdmin = function (username, password, email, callback) {
        var payload = {
            username: username,
            password: password,
            email: email
        };

        $http.post('/api/v1/createadmin', payload)
        .success(function(data, status, headers, config) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data.activated);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.listUsers = function (callback) {
        $http.get('/api/v1/user/list')
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.createUser = function (username, password, email, callback) {
        var data = {
            username: username,
            password: password,
            email: email
        };

        $http.post('/api/v1/user/create', data)
        .success(function(data, status, headers, config) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.removeUser = function (username, password, callback) {
        var data = {
            username: username,
            password: password
        };

        $http.post('/api/v1/user/remove', data)
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.changePassword = function (currentPassword, newPassword, callback) {
        var data = {
            password: currentPassword,
            newPassword: newPassword
        };

        $http.post('/api/v1/user/password', data)
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null, data);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.login = function (token, callback) {
        var that = this;

        $http.defaults.headers.common.Authorization = 'Token ' + token;

        $http.get('/api/v1/user/token')
        .success(function(data, status, headers, config) {
            if (status !== 200) {
                that.setToken(null);
                return callback(new ClientError(status, data));
            }

            // cache the user credentials and server address
            that._username = data.userInfo.username;
            that._userInfo = data.userInfo;
            that.setToken(data.token);

            callback(null, data.token);
        })
        .error(function(data, status, headers, config) {
            that.setToken(null);
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.logout = function () {
        localStorage.removeItem('token');
        this.setToken(null);
        this._username = '';
        this._userInfo = null;
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

        $http.post('/api/v1/oauth/token?response_type=token&client_id=' + this._clientId, data)
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));

            that.login(data.access_token, function (error, result) {
                callback(null, data.access_token);
            });
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    return new Client();
});
