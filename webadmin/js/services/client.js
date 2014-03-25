'use strict';

/* global angular:false */

angular.module('clientService', [])
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
        console.debug('Create new client.');

        this._username = null;
        this._userInfo = null;
        this._token = null;

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

    Client.prototype.getToken = function () {
        return this._token;
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
        $http.delete('/api/v1/volume/' + volumeId + '/users', { headers: {password: password}})
        .success(function (data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            callback(null);
        })
        .error(function (data, status, headers, config) {
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

    Client.prototype.tokenLogin = function (oldToken, callback) {
        $http.defaults.headers.common.Authorization = 'Token ' + oldToken;
        this._login(callback);
    };

    Client.prototype.logout = function () {
        localStorage.removeItem('token');
        this.setToken(null);
        this._username = '';
        this._userInfo = null;
    };

    Client.prototype.login = function (username, password, callback) {
        $http.defaults.headers.common.Authorization = 'Basic ' + $base64.encode(username + ':' + password);
        this._login(callback);
    };

    /*
     * Internal login which is wrapped by login() and tokenLogin()
     * The wrappers setup the auth header
     */
    Client.prototype._login = function  (callback) {
        var that = this;

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

    return new Client();
});