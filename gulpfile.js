/* jslint node:true */

'use strict';

var _ejs = require('ejs'),
    ejs = require('gulp-ejs'),
    gulp = require('gulp'),
    del = require('del'),
    path = require('path'),
    fs = require('fs');

_ejs.filters.basename = function (obj) {
    return path.basename(obj);
};

gulp.task('3rdparty', function () {
    return gulp.src([
            'webadmin/3rdparty/**/*.js',
            'webadmin/3rdparty/**/*.css',
            'webadmin/3rdparty/**/*.otf',
            'webadmin/3rdparty/**/*.eot',
            'webadmin/3rdparty/**/*.svg',
            'webadmin/3rdparty/**/*.ttf',
            'webadmin/3rdparty/**/*.woff',
            'webadmin/3rdparty/**/*.js'
        ])
        .pipe(gulp.dest('dist/3rdparty/'));
});

gulp.task('html', ['html_templates'], function () {
    gulp.src(['webadmin/*.html', 'webadmin/views/*.html'])
        .pipe(gulp.dest('dist'));
});

gulp.task('html_templates', function () {
    var config = JSON.parse(fs.readFileSync('./deploymentConfig.json'));

    gulp.src('webadmin/*.ejs')
        .pipe(ejs(config, { ext: '.html' }))
        .pipe(gulp.dest('dist'));
});

gulp.task('clean', function (callback) {
    del(['dist'], callback);
});

gulp.task('default', ['clean'], function () {
    gulp.start('html', '3rdparty');
});
