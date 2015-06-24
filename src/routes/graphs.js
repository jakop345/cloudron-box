'use strict';


exports.getGraphs = getGraphs;


var middleware = require('../middleware/index.js'),
    url = require('url');

var graphiteProxy = middleware.proxy(url.parse('http://127.0.0.1:8000'));

function getGraphs(req, res, next) {
    var parsedUrl = url.parse(req.url, true /* parseQueryString */);
    delete parsedUrl.query['access_token'];
    delete req.headers['authorization'];
    delete req.headers['cookies'];
    req.url = url.format({ pathname: 'render', query: parsedUrl.query });

    graphiteProxy(req, res, next);
}

