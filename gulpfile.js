/* jslint node:true */

'use strict';

var ejs = require('gulp-ejs'),
    gulp = require('gulp'),
    del = require('del'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    sourcemaps = require('gulp-sourcemaps'),
    fs = require('fs');

gulp.task('3rdparty', function () {
    gulp.src([
        'webadmin/src/3rdparty/**/*.js',
        'webadmin/src/3rdparty/**/*.map',
        'webadmin/src/3rdparty/**/*.css',
        'webadmin/src/3rdparty/**/*.otf',
        'webadmin/src/3rdparty/**/*.eot',
        'webadmin/src/3rdparty/**/*.svg',
        'webadmin/src/3rdparty/**/*.ttf',
        'webadmin/src/3rdparty/**/*.woff'
        ])
        .pipe(gulp.dest('webadmin/dist/3rdparty/'))
        .pipe(gulp.dest('setup/splash/website/3rdparty'));
});


// --------------
// JavaScript
// --------------

gulp.task('js', ['js-index', 'js-setup', 'js-update', 'js-error'], function () {});

gulp.task('js-index', function () {
    gulp.src([
        'webadmin/src/js/index.js',
        'webadmin/src/js/client.js',
        'webadmin/src/js/appstore.js',
        'webadmin/src/js/main.js',
        'webadmin/src/views/*.js'
        ])
        .pipe(sourcemaps.init())
        .pipe(concat('index.js', { newLine: ';' }))
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-setup', function () {
    gulp.src(['webadmin/src/js/setup.js', 'webadmin/src/js/client.js'])
        .pipe(sourcemaps.init())
        .pipe(concat('setup.js', { newLine: ';' }))
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-error', function () {
    gulp.src(['webadmin/src/js/error.js'])
        .pipe(sourcemaps.init())
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'));
});

gulp.task('js-update', function () {
    gulp.src(['webadmin/src/js/update.js'])
        .pipe(sourcemaps.init())
        .pipe(uglify())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('webadmin/dist/js'))
        .pipe(gulp.dest('setup/splash/website/js'));
});


// --------------
// HTML
// --------------

gulp.task('html', ['html-templates', 'html-views'], function () {
    gulp.src('webadmin/src/*.html').pipe(gulp.dest('webadmin/dist'));
    gulp.src(['webadmin/src/update.html']).pipe(gulp.dest('setup/splash/website'));
});

gulp.task('html-views', function () {
    gulp.src('webadmin/src/views/*.html').pipe(gulp.dest('webadmin/dist/views'));
});

gulp.task('html-templates', function () {
    var config = JSON.parse(fs.readFileSync('./webadmin/deploymentConfig.json'));

    gulp.src('webadmin/src/*.ejs')
        .pipe(ejs(config, { ext: '.html' }))
        .pipe(gulp.dest('webadmin/dist'));
});


// --------------
// Utilities
// --------------

gulp.task('develop', ['default'], function () {
    gulp.watch(['webadmin/src/*.html'], ['html']);
    gulp.watch(['webadmin/src/*.ejs'], ['html-templates']);
    gulp.watch(['webadmin/src/views/*.html'], ['html-views']);
    gulp.watch(['webadmin/src/js/update.js'], ['js-update']);
    gulp.watch(['webadmin/src/js/error.js'], ['js-error']);
    gulp.watch(['webadmin/src/js/setup.js', 'webadmin/src/js/client.js'], ['js-setup']);
    gulp.watch(['webadmin/src/js/index.js', 'webadmin/src/js/client.js', 'webadmin/src/js/appstore.js', 'webadmin/src/js/main.js', 'webadmin/src/views/*.js'], ['js-index']);
    gulp.watch(['webadmin/src/3rdparty/**/*'], ['3rdparty']);
});

gulp.task('clean', function (callback) {
    del(['webadmin/dist', 'setup/splash/website'], callback);
});

gulp.task('default', ['clean'], function () {
    gulp.start('html', 'js', '3rdparty');
});
