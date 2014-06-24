'use strict';

/* global angular:false */

angular.module('YellowTent')
.service('AppStore', function ($http, Client) {

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
        this._appsCache = null;
    }

    AppStore.prototype.getApps = function (callback) {
        if (this._appsCache !== null) return callback(null, this._appsCache);
        if (Client.getConfig() === null) return callback(new AppStoreError(500, 'Not yet initialized'));

        var that = this;

        $http.get(Client.getConfig().appstoreOrigin + '/api/v1/apps')
        .success(function (data, status, headers) {
            if (status !== 200) return callback(new AppStoreError(status, data));

            var apps = data.apps;
            apps.forEach(function (app) { app.iconUrl = Client.getConfig().appstoreOrigin + '/api/v1/app/' + app.id + '/icon'; });
            that._appsCache = apps;
            return callback(null, apps);
        }).error(function (data, status, headers) {
            return callback(new AppStoreError(status, data));
        });
    };

    // TODO currently assumes that getApps was called at some point
    AppStore.prototype.getAppById = function (appId, callback) {
        if (this._appsCache !== null) {
            for (var i = 0; i < this._appsCache.length; i++) {
                if (this._appsCache[i].id === appId) return callback(null, this._appsCache[i]);
            }
        }
        return callback(new AppStoreError(404, 'Not found'));
    };

    return new AppStore();
});
