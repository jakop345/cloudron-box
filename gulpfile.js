/* jslint node:true */

'use strict';

var _ejs = require('ejs'),
    ejs = require('gulp-ejs'),
    gulp = require('gulp'),
    del = require('del'),
    path = require('path'),
    concat = require('gulp-concat'),
    sourcemaps = require('gulp-sourcemaps'),
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
            'webadmin/src/3rdparty/**/*.woff'
        ])
        .pipe(gulp.dest('webadmin/dist/3rdparty/'));
});

gulp.task('update-3rdparty', function () {
    return gulp.src([
            'webadmin/src/3rdparty/**/*.js',
            'webadmin/src/3rdparty/**/*.css',
            'webadmin/src/3rdparty/**/*.otf',
            'webadmin/src/3rdparty/**/*.eot',
            'webadmin/src/3rdparty/**/*.svg',
            'webadmin/src/3rdparty/**/*.ttf',
            'webadmin/src/3rdparty/**/*.woff'
        ])
        .pipe(gulp.dest('setup/splash/website/3rdparty'));
});

gulp.task('update-js', function () {
    return gulp.src(['webadmin/src/js/update.js']).pipe(gulp.dest('setup/splash/website/js'));
});

gulp.task('update-html', function () {
    return gulp.src(['webadmin/src/update.html']).pipe(gulp.dest('setup/splash/website'));
});

gulp.task('update', ['update-html', 'update-js', 'update-3rdparty'], function () {});

gulp.task('update-watch', ['update-html', 'update-js', 'update-3rdparty'], function () {
    gulp.watch('webadmin/src/update.html', ['update-html']);
    gulp.watch('webadmin/src/js/update.js', ['update-js']);
});

gulp.task('js-index', function () {
    return gulp.src(['webadmin/src/js/index.js', 'webadmin/src/js/client.js', 'webadmin/src/js/appstore.js', 'webadmin/src/js/main.js', 'webadmin/src/views/*.js'])
        .pipe(sourcemaps.init())
        .pipe(concat('index.js'))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-setup', function () {
    return gulp.src(['webadmin/src/js/setup.js', 'webadmin/src/js/client.js'])
        .pipe(sourcemaps.init())
        .pipe(concat('setup.js'))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-update', function () {
    return gulp.src(['webadmin/src/js/update.js'])
        .pipe(sourcemaps.init())
        .pipe(concat('update.js'))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js', ['js-index', 'js-setup', 'js-update'], function () {});

gulp.task('htmlViews', function () {
    return gulp.src('webadmin/src/views/*.html')
        .pipe(gulp.dest('webadmin/dist/views'));
});

gulp.task('html_templates', function () {
    var config = JSON.parse(fs.readFileSync('./webadmin/deploymentConfig.json'));

    return gulp.src('webadmin/src/*.ejs')
        .pipe(ejs(config, { ext: '.html' }))
        .pipe(gulp.dest('webadmin/dist'));
});

gulp.task('html', ['html_templates', 'htmlViews'], function () {
    return gulp.src('webadmin/src/*.html')
        .pipe(gulp.dest('webadmin/dist'));
});

gulp.task('clean', function (callback) {
    del(['webadmin/dist', 'setup/splash/website'], callback);
});

gulp.task('default', ['clean'], function () {
    gulp.start('html', 'js', '3rdparty', 'update');
});
