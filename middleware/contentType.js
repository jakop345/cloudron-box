module.exports = function contentType(type) {
    return function (req, res, next) {
        res.setHeader('Content-Type', type);
        next();
    }
}

