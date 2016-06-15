'use strict';

// WARNING WARNING WARNING WARNING WARNING WARNING WARNING WARNING
// These constants are used in the installer script as well
// Do not require anything here!

exports = module.exports = {
    'version': 36,

    'baseImage': 'cloudron/base:0.8.1',

    'images': {
        'mysql': { repo: 'cloudron/mysql', tag: 'cloudron/mysql:0.11.0' },
        'postgresql': { repo: 'cloudron/postgresql', tag: 'cloudron/postgresql:0.11.0' },
        'mongodb': { repo: 'cloudron/mongodb', tag: 'cloudron/mongodb:0.9.0' },
        'redis': { repo: 'cloudron/redis', tag: 'cloudron/redis:0.8.0' },
        'mail': { repo: 'cloudron/mail', tag: 'cloudron/mail:0.13.2' },
        'graphite': { repo: 'cloudron/graphite', tag: 'cloudron/graphite:0.8.0' }
    }
};

