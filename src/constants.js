'use strict';

 // default admin installation location. keep in sync with ADMIN_LOCATION in setup/start.sh and BOX_ADMIN_LOCATION in appstore constants.js
exports = module.exports = {
    ADMIN_LOCATION: 'my',
    API_LOCATION: 'api', // this is unused but reserved for future use (#403)
    SMTP_LOCATION: 'smtp',
    IMAP_LOCATION: 'imap',
    MAIL_LOCATION: 'my', // not a typo! should be same as admin location until we figure out certificates
    POSTMAN_LOCATION: 'postman', // used in dovecot bounces

    ADMIN_NAME: 'Settings',

    ADMIN_CLIENT_ID: 'webadmin', // oauth client id
    ADMIN_APPID: 'admin', // admin appid (settingsdb)

    GHOST_USER_FILE: '/tmp/cloudron_ghost',

    DEFAULT_MEMORY_LIMIT: (256 * 1024 * 1024) // see also client.js
};

