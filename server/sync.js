'use strict';

var dirIndex = require('../lib/dirindex');

exports = module.exports = {
    index: null,
    initialize: initialize
};

function initialize(config) {
    var index = exports.index = new dirIndex.DirIndex();

    index.update(config.root, function () {
        console.log(index.entryList);
    });
}

