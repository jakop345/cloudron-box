'use strict';

exports = module.exports = {
    clientErrorHandler: require('connect-lastmile').clientErrorHandler,
    contentType: require('./contentType'),
    cookieParser: require('cookie-parser'),
    cors: require('./cors'),
    favicon: require('serve-favicon'),
    json: require('body-parser').json,
    morgan: require('morgan'),
    proxy: require('proxy-middleware'),
    serverErrorHandler: require('connect-lastmile').serverErrorHandler,
    session: require('express-session'),
    successHandler: require('connect-lastmile').successHandler,
    timeout: require('connect-timeout'),
    urlencoded: require('body-parser').urlencoded
};
