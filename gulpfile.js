/* jslint node:true */

'use strict';

var _ejs = require('ejs'),
    ejs = require('gulp-ejs'),
    gulp = require('gulp'),
    path = require('path'),
    fs = require('fs');

_ejs.filters.basename = function (obj) {
    return path.basename(obj);
};

gulp.task('html', ['html_templates'], function () {
    gulp.src('webadmin/**/*.html')
        .pipe(gulp.dest('dist'));
});

gulp.task('html_templates', function () {
    var config = JSON.parse(fs.readFileSync('./deploymentConfig.json'));

    gulp.src('webadmin/*.ejs')
        .pipe(ejs(config, { ext: '.html' }))
        .pipe(gulp.dest('dist'));
});

gulp.task('default', function () {
    gulp.start('html');
});
