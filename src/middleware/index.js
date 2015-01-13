'use strict';

exports = module.exports = {
    contentType: require('./contentType'),
    cookieParser: require('cookie-parser'),
    cors: require('./cors'),
    csrf: require('csurf'),
    favicon: require('serve-favicon'),
    json: require('body-parser').json,
    morgan: require('morgan'),
    proxy: require('proxy-middleware'),
    lastMile: require('connect-lastmile'),
    session: require('express-session'),
    timeout: require('connect-timeout'),
    urlencoded: require('body-parser').urlencoded
};
