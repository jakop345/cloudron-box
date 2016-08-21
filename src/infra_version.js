'use strict';

// WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING
// These constants are used in the installer script as well
// Do not require anything here!

exports = module.exports = {
    // a version bump means that all containers (apps and addons) are recreated
    'version': 40,

    'baseImages': [ 'cloudron/base:0.8.1', 'cloudron/base:0.9.0' ],

    'images': {
        'mysql': { repo: 'cloudron/mysql', tag: 'cloudron/mysql:0.13.0' },
        'postgresql': { repo: 'cloudron/postgresql', tag: 'cloudron/postgresql:0.12.0' },
        'mongodb': { repo: 'cloudron/mongodb', tag: 'cloudron/mongodb:0.11.0' },
        'redis': { repo: 'cloudron/redis', tag: 'cloudron/redis:0.10.0' },
        'mail': { repo: 'cloudron/mail', tag: 'cloudron/mail:0.20.0' },
        'graphite': { repo: 'cloudron/graphite', tag: 'cloudron/graphite:0.10.0' }
    }
};

