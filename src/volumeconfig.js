'use strict';

var assert = require('assert'),
    debug = require('debug')('box:config'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    safe = require('safetydance');

function VolumeConfig(name, directory) {
    assert(name && typeof name === 'string', 'VolumeConfig needs a name for the VolumeConfig file.');
    assert(directory && typeof directory === 'string', 'VolumeConfig needs directory for the VolumeConfig file.');

    this.store = {};
    this.VolumeConfigDir = directory;
    this.VolumeConfigFile = path.join(this.VolumeConfigDir, name + '.json');
    this.load();
}

VolumeConfig.prototype.getFilePath = function () {
    return this.VolumeConfigFile;
};

VolumeConfig.prototype.get = function (key, defaultValue) {
    var ret = defaultValue;

    if (this.store.hasOwnProperty(key)) {
        ret = this.store[key];
    }

    if (typeof ret === 'object' && ret !== null) {
        ret = safe.JSON.parse(JSON.stringify(ret));
        if (!ret) {
            console.error('Failed to copy the VolumeConfig value.', safe.error);
            ret = defaultValue;
        }
    }

    return ret;
};

VolumeConfig.prototype.set = function (key, value) {
    if (this.store[key] !== value) {
        this.store[key] = value;
        this.save();
    }
};

VolumeConfig.prototype.hset = function (key, field, value) {
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

VolumeConfig.prototype.hget = function (key, field, defaultValue) {
    if (!this.hexists(key, field)) return defaultValue;
    return this.store[key][field];
};

VolumeConfig.prototype.hdel = function (key, field) {
    if (!this.hexists(key, field)) return false;

    delete this.store[key][field];
    this.save();

    return true;
};

VolumeConfig.prototype.hexists = function (key, field) {
    if (!this.store.hasOwnProperty(key)) return false;
    if (typeof this.store[key] !== 'object') return false;
    return this.store[key].hasOwnProperty(field);
};

VolumeConfig.prototype.save = function () {
    var that = this;

    // ensure VolumeConfig folder
    safe.safeCall(function () { mkdirp.sync(that.VolumeConfigDir); });

    this.exists = true;
    var data = safe.JSON.stringify(this.store, null, 4);
    if (!safe.fs.writeFileSync(this.VolumeConfigFile, data)) {
        console.error('Unable to save VolumeConfig file.', this.VolumeConfigFile, safe.error);
    }
};

VolumeConfig.prototype.load = function () {
    var content = safe.fs.readFileSync(this.VolumeConfigFile);
    this.store = safe.JSON.parse(content);
    if (!this.store) {
        debug('Unable to load VolumeConfig file', this.VolumeConfigFile, '. Using empty default.');
        this.store = {};
    }

    this.exists = true;
};

exports = module.exports = VolumeConfig;
