'use strict';

exports = module.exports = {
    user: require('../../auth/routes/user.js'),
    file: require('./file.js'),
    volume: require('../../volume/routes/volume.js'),
    sync: require('./sync.js'),
    fileops: require('./fileops.js')
};

