'use strict';

var middleware = require('../../middleware/index.js'),
    url = require('url');

exports = module.exports = {
    getGraphs: getGraphs,
    forwardToGraphite: forwardToGraphite
};

var graphiteProxy = middleware.proxy(url.parse('http://127.0.0.1:8000'));

function forwardToGraphite(req, res, next) {
    // remove any sensitive info
    var parsedUrl = url.parse(req.url, true /* parseQueryString */);
    delete parsedUrl.query['access_token'];
    delete req.headers['authorization']
    req.url = url.format({ pathname: parsedUrl.pathname, query: parsedUrl.query });

    graphiteProxy(req, res, next);
};

function getGraphs(req, res, next) {
    req.url = req.url.replace(/^\/api\/v1\/graphs(\?.*)/, '/render$1');
    forwardToGraphite(req, res, next);
}

