'use strict';

var mkdirp = require('mkdirp'),
    assert = require('assert'),
    debug = require('debug')('server:config'),
    path = require('path'),
    safe = require('safetydance');

function Config(name, directory) {
    assert(name && typeof name === 'string', 'Config needs a name for the config file.');
    assert(directory && typeof directory === 'string', 'Config needs directory for the config file.');

    this.store = {};
    this.configDir = directory;
    this.configFile = path.join(this.configDir, name + '.json');
    this.load();
}

Config.prototype.getFilePath = function () {
    return this.configFile;
};

Config.prototype.get = function (key, defaultValue) {
    var ret = defaultValue;

    if (this.store.hasOwnProperty(key)) {
        ret = this.store[key];
    }

    if (typeof ret === 'object' && ret !== null) {
        ret = safe.JSON.parse(JSON.stringify(ret));
        if (!ret) {
            console.error('Failed to copy the config value.', safe.error);
            ret = defaultValue;
        }
    }

    return ret;
};

Config.prototype.set = function (key, value) {
    if (this.store[key] !== value) {
        this.store[key] = value;
        this.save();
    }
};

Config.prototype.hset = function (key, field, value) {
    // do not overwrite old object
    if (!this.store.hasOwnProperty(key)) {
        this.store[key] = {};
    } else if (typeof this.store[key] !== 'object') {
        return false;
    }

    this.store[key][field] = value;
    this.save();

    return true;
};

Config.prototype.hget = function (key, field, defaultValue) {
    if (!this.hexists(key, field)) return defaultValue;
    return this.store[key][field];
};

Config.prototype.hdel = function (key, field) {
    if (!this.hexists(key, field)) return false;

    delete this.store[key][field];
    this.save();

    return true;
};

Config.prototype.hexists = function (key, field) {
    if (!this.store.hasOwnProperty(key)) return false;
    if (typeof this.store[key] !== 'object') return false;
    return this.store[key].hasOwnProperty(field);
};

Config.prototype.save = function () {
    var that = this;

    // ensure config folder
    safe.safeCall(function () { mkdirp.sync(that.configDir); });

    this.exists = true;
    var data = safe.JSON.stringify(this.store, null, 4);
    if (!safe.fs.writeFileSync(this.configFile, data)) {
        console.error('Unable to save config file.', this.configFile, safe.error);
    }
};

Config.prototype.load = function () {
    var content = safe.fs.readFileSync(this.configFile);
    this.store = safe.JSON.parse(content);
    if (!this.store) {
        debug('Unable to load config file', this.configFile, '. Using empty default.');
        this.store = {};
    }

    this.exists = true;
};

exports = module.exports = Config;