'use strict';

 // default admin installation location. keep in sync with ADMIN_LOCATION in setup/start.sh and BOX_ADMIN_LOCATION in appstore constants.js
exports = module.exports = {
    ADMIN_LOCATION: 'my',
    API_LOCATION: 'api', // this is unused but reserved for future use (#403)
    ADMIN_NAME: 'Settings',

    ADMIN_CLIENT_ID: 'webadmin', // oauth client id
    ADMIN_APPID: 'admin', // admin appid (settingsdb)

    TEST_NAME: 'Test',
    TEST_LOCATION: '',
    TEST_CLIENT_ID: 'test',

    CLOUDRON_DEFAULT_NAME: 'Cloudron',
    CLOUDRON_DEFAULT_AVATAR_FILE: __dirname + '/avatar.png',
    CLOUDRON_AVATAR_FILE: '/data/box/avatar.png'
};

