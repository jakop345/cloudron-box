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
            'webadmin/src/3rdparty/**/*.js',
            'webadmin/src/3rdparty/**/*.css',
            'webadmin/src/3rdparty/**/*.otf',
            'webadmin/src/3rdparty/**/*.eot',
            'webadmin/src/3rdparty/**/*.svg',
            'webadmin/src/3rdparty/**/*.ttf',
            'webadmin/src/3rdparty/**/*.woff',
            'webadmin/src/3rdparty/**/*.js'
        ])
        .pipe(gulp.dest('webadmin/dist/3rdparty/'));
});

gulp.task('jsViews', function () {
    return gulp.src('webadmin/src/views/*.js')
        .pipe(gulp.dest('webadmin/dist/views'));
});

gulp.task('js', ['jsViews'], function () {
    return gulp.src('webadmin/src/js/*.js')
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('htmlViews', function () {
    return gulp.src('webadmin/src/views/*.html')
        .pipe(gulp.dest('webadmin/dist/views'));
});

gulp.task('html', ['html_templates', 'htmlViews'], function () {
    return gulp.src('webadmin/src/*.html')
        .pipe(gulp.dest('webadmin/dist'));
});

gulp.task('html_templates', function () {
    var config = JSON.parse(fs.readFileSync('./deploymentConfig.json'));

    return gulp.src('webadmin/src/*.ejs')
        .pipe(ejs(config, { ext: '.html' }))
        .pipe(gulp.dest('webadmin/dist'));
});

gulp.task('clean', function (callback) {
    del(['webadmin/dist'], callback);
});

gulp.task('default', ['clean'], function () {
    gulp.start('html', 'js', '3rdparty');
});
