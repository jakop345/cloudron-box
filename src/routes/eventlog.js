'use strict';

exports = module.exports = {
    get: get
};

var eventlog = require('../eventlog.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function get(req, res, next) {
    var page = typeof req.query.page !== 'undefined' ? parseInt(req.query.page) : 1;
    if (!page || page < 0) return next(new HttpError(400, 'page query param has to be a postive number'));

    var perPage = typeof req.query.per_page !== 'undefined'? parseInt(req.query.per_page) : 25;
    if (!perPage || perPage < 0) return next(new HttpError(400, 'per_page query param has to be a postive number'));

    eventlog.getAllPaged(page, perPage, function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { eventlog: result }));
    });
}
