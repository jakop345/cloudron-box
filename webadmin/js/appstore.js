'use strict';

/* global angular:false */

angular.module('YellowTent')
.service('AppStore', function ($http, Config) {

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

        var that = this;
        $http.get(Config.APPSTORE_URL + '/api/v1/apps')
        .success(function (data, status, headers) {
            if (status !== 200) return callback(new AppStoreError(status, data));

            var apps = data.apps;
            apps.forEach(function (app) { app.iconUrl = Config.APPSTORE_URL + "/api/v1/app/" + app.id + "/icon"; });
            that._appsCache = apps;
            return callback(null, apps);
        }).error(function (data, status, headers) {
            return callback(new AppStoreError(status, data));
        });
    };

    return new AppStore();
});
