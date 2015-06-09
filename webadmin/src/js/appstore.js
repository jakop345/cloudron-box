'use strict';

/* global angular:false */

angular.module('Application').service('AppStore', ['$http', 'Client', function ($http, Client) {

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
        this._appsCache = [];
    }

    AppStore.prototype.getApps = function (callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(420, 'Enhance Your Calm'));

        var that = this;

        $http.get(Client.getConfig().apiServerOrigin + '/api/v1/apps', { params: { boxVersion: Client.getConfig().version } }).success(function (data, status) {
            if (status !== 200) return callback(new AppStoreError(status, data));

            angular.copy(data.apps, that._appsCache);

            return callback(null, that._appsCache);
        }).error(function (data, status) {
            return callback(new AppStoreError(status, data));
        });
    };

    AppStore.prototype.getAppsFast = function (callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(420, 'Enhance Your Calm'));

        if (this._appsCache.length !== 0) return callback(null, this._appsCache);

        this.getApps(callback);
    };

    AppStore.prototype.getAppById = function (appId, callback) {
        var that = this;

        // check cache
        for (var app in this._appsCache) {
            if (this._appsCache[app].id === appId) return callback(null, this._appsCache[app]);
        }

        this.getApps(function (error) {
            if (error) return callback(error);

            // recheck cache
            for (var app in that._appsCache) {
                if (that._appsCache[app].id === appId) return callback(null, that._appsCache[app]);
            }

            callback(new AppStoreError(404, 'Not found'));
        });
    };

    AppStore.prototype.getManifest = function (appId, callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(420, 'Enhance Your Calm'));

        var manifestUrl = Client.getConfig().apiServerOrigin + '/api/v1/apps/' + appId;
        console.log('Getting the manifest of ', appId, manifestUrl);
        $http.get(manifestUrl).success(function (data, status) {
            if (status !== 200) return callback(new AppStoreError(status, data));
            return callback(null, data.manifest);
        }).error(function (data, status) {
            return callback(new AppStoreError(status, data));
        });
    };

    AppStore.prototype.getSizes = function (callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(420, 'Enhance Your Calm'));

        $http.get(Client.getConfig().apiServerOrigin + '/api/v1/sizes').success(function (data, status) {
            if (status !== 200) return callback(new AppStoreError(status, data));
            return callback(null, data.sizes);
        }).error(function (data, status) {
            return callback(new AppStoreError(status, data));
        });
    };

    AppStore.prototype.getRegions = function (callback) {
        if (Client.getConfig().apiServerOrigin === null) return callback(new AppStoreError(420, 'Enhance Your Calm'));

        $http.get(Client.getConfig().apiServerOrigin + '/api/v1/regions').success(function (data, status) {
            if (status !== 200) return callback(new AppStoreError(status, data));
            return callback(null, data.regions);
        }).error(function (data, status) {
            return callback(new AppStoreError(status, data));
        });
    };

    return new AppStore();
}]);
