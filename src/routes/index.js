'use strict';

exports = module.exports = {
    user: require('../../auth/routes/user.js'),
    file: require('./file.js'),
    sync: require('./sync.js'),
    fileops: require('./fileops.js'),
    volume: require('./volume.js')
};

