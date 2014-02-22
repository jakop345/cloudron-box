'use strict';

/* global angular:false */

angular.module('clientFactory', [])
.service('Client', function ($http) {

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

        this._server = null;
        this._username = null;
        this._userInfo = null;
        this._token = null;
        this._cachedPassword = null;

        this.setServer(sessionStorage.server);
    }

    Client.prototype.setServer = function (server) {
        if (!server) {
            this._server = null;
        } else {
            while (server[server.length-1] === '/') {
                server = server.slice(0, server.length-1);
            }

            if (server.indexOf('http://') !== 0 && server.indexOf('https://') !== 0) {
                server = 'http://' + server;
            }

            this._server = server;
        }

        console.debug('Set client server ', this._server);
    };

    Client.prototype.getServer = function () {
        return this._server;
    };

    Client.prototype.isAdmin = function () {
        return this._userInfo ? this._userInfo.admin : false;
    };

    Client.prototype.getUserInfo = function () {
        return this._userInfo;
    };

    Client.prototype.setToken = function (token) {
        console.debug('Set client token to ', token);
        this._token = token;
    };

    Client.prototype.getToken = function () {
        return this._token;
    };

    Client.prototype._attachAuthInfo = function (req) {
        if (this._token) {
            req.query({ auth_token: this._token });
        } else if (this._username) {
            req.auth(this._username, this._cachedPassword);
        }
    };

    Client.prototype.get = function (path) {
        if (path[0] !== '/') path = '/' + path;

        console.debug('GET ' + this._server + path);
        var req = $http.get(this._server + path)
            .success(function(data, status, headers, config) {
                // this callback will be called asynchronously
                // when the response is available
            })
            .error(function(data, status, headers, config) {
                // called asynchronously if an error occurs
                // or server returns response with an error status.
            });
        this._attachAuthInfo(req);
        return req;
    };

    Client.prototype.put = function (path) {
        if (path[0] !== '/') path = '/' + path;

        console.debug('PUT ' + this._server + path);
        var req = request.put(this._server + path);
        this._attachAuthInfo(req);
        return req;
    };

    Client.prototype.post = function (path) {
        if (path[0] !== '/') path = '/' + path;

        console.debug('POST ' + this._server + '====' + path);
        var req = request.post(this._server + path);
        this._attachAuthInfo(req);
        return req;
    };

    Client.prototype.createVolume = function (name, password, callback) {
        var req = this.post('/api/v1/volume/create');
        req.send({ password: password, name: name });
        req.end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));
            if (result.statusCode !== 201) return callback(new ClientError(result.statusCode, result.text));

            callback(null, result);
        });
    };

    Client.prototype.deleteVolume = function (name, password, callback) {
        var req = this.post('/api/v1/volume/' + name + '/delete');
        req.send({ password: password });
        req.end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));
            if (result.statusCode !== 200) return callback(new ClientError(result.statusCode, result.text));

            callback(null, result);
        });
    };

    Client.prototype.mount = function (name, password, callback) {
        var req = this.post('/api/v1/volume/' + name + '/mount');
        req.send({ password: password });
        req.end(function (err, res) {
            if (err) return callback(new ClientError(err.code, err.message));
            if (res.statusCode !== 200) return callback(new ClientError(res.statusCode, res.text));

            callback(null, res);
        });
    };

    Client.prototype.unmount = function (name, password, callback) {
        var req = this.post('/api/v1/volume/' + name + '/unmount');
        req.send({ password: password });
        req.end(function (err, res) {
            if (err) return callback(new ClientError(err.code, err.message));
            if (res.statusCode !== 200) return callback(new ClientError(res.statusCode, res.text));

            callback(null, res);
        });
    };

    // FIXME: this breaks node.js convention of first arg having the err always
    Client.prototype.isMounted = function (name, callback) {
        this.get('/api/v1/volume/' + name + '/ismounted').end(function (err, res) {
            if (err || res.statusCode !== 200) {
                return callback(false);
            }

            return callback(res.body.mounted);
        });
    };

    Client.prototype.listVolumes = function (callback) {
        var that = this;

        this.get('/api/v1/volume/list').end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));

            that.emit('volumes', result.body.volumes);
            callback(null, result.body.volumes);
        });
    };

    Client.prototype.isServerAvailable = function (callback) {
        this.get('/api/v1/version').end(function (error, result) {
            if (error) return callback(error);

            return callback(null, (result.statusCode === 200));
        });
    };

    Client.prototype.isServerFirstTime = function (callback) {
        $http.get(this._server + '/api/v1/firsttime')
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

        $http.post(this._server + '/api/v1/createadmin', payload)
        .success(function(data, status, headers, config) {
            if (status !== 201) return callback(new ClientError(status, data));
            callback(null, data.activated);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    Client.prototype.listUsers = function (callback) {
        this.get('/api/v1/user/list').end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));
            callback(null, result.body);
        });
    };

    Client.prototype.createUser = function (username, password, email, callback) {
        var payload = {
            username: username,
            password: password,
            email: email
        };

        this.post('/api/v1/user/create').send(payload).end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));
            if (result.statusCode !== 201) return callback(new ClientError(result.statusCode, result.text));

            callback();
        });
    };

    Client.prototype.removeUser = function (username, password, callback) {
        this.post('/api/v1/user/remove').send({ username: username, password: password }).end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));
            if (result.statusCode !== 200) return callback(new ClientError(result.statusCode, result.text));

            callback();
        });
    };

    Client.prototype.changePassword = function (currentPassword, newPassword, callback) {
        this.post('/api/v1/user/password').send({ password: currentPassword, newPassword: newPassword}).end(function (error, result) {
            if (error) return callback(new ClientError(error.code, error.message));
            if (result.statusCode !== 200) return callback(new ClientError(result.statusCode, result.text));

            callback();
        });
    };

    Client.prototype.tokenLogin = function (oldToken, callback) {
        var that = this;

        request.get(this._server + '/api/v1/user/token')
            .query({ auth_token: oldToken })
            .end(function (error, result) {
            if (error) {
                that.emit('offline');
                return callback(new ClientError(error.code, error.message));
            }

            if (result.statusCode !== 200) {
                that.emit('offline');
                return callback(new ClientError(result.statusCode, result.text));
            }

            // cache the user credentials and server address
            that._token = result.body.token;
            that._userInfo = result.body.userInfo;

            that.emit('online');

            callback(null, that._token);
        });
    };

    Client.prototype.login = function (username, password, callback) {
        var that = this;

        $http.defaults.headers.common['Authorization'] = 'Basic ' + btoa(username + ':' + password);

        $http.get(this._server + '/api/v1/user/token')
        .success(function(data, status, headers, config) {
            if (status !== 200) return callback(new ClientError(status, data));
            // cache the user credentials and server address
            that._username = username;
            that._cachedPassword = password;
            that._token = data.token;
            that._userInfo = data.userInfo;

            callback(null, that._token);
        })
        .error(function(data, status, headers, config) {
            callback(new ClientError(status, data));
        });
    };

    return new Client();
});