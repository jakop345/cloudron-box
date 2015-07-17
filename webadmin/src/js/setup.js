'use strict';

// create main application module
var app = angular.module('Application', ['ngRoute', 'ngAnimate', 'angular-md5', 'ui-notification']);

app.directive('ngEnter', function () {
    return function (scope, element, attrs) {
        element.bind('keydown keypress', function (event) {
            if(event.which === 13) {
                scope.$apply(function (){
                    scope.$eval(attrs.ngEnter);
                });

                event.preventDefault();
            }
        });
    };
});

// setup all major application routes
app.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/', {
        redirectTo: '/step1'
    }).when('/step1', {
        controller: 'StepController',
        templateUrl: 'views/setup/step1.html'
    }).when('/step2', {
        controller: 'StepController',
        templateUrl: 'views/setup/step2.html'
    }).when('/step3', {
        controller: 'StepController',
        templateUrl: 'views/setup/step3.html'
    }).when('/step4', {
        controller: 'FinishController',
        templateUrl: 'views/setup/step4.html'
    }).otherwise({ redirectTo: '/'});
}]);

app.service('Wizard', [ function () {
    var instance = null;

    function Wizard() {
        this.username = '';
        this.email = '';
        this.password = '';
        this.name = '';
        this.availableAvatars = [{
            file: null,
            data: null,
            url: '/img/avatars/avatar_0.png',
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cloudfacegreen.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cloudfaceturquoise.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cloudglassesgreen.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cloudglassespink.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cloudglassesturquoise.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cloudglassesyellow.png'
        }];
        this.avatar = {};
        this.avatarBlob = null;
    }

    Wizard.prototype.setPreviewAvatar = function (avatar) {
        var that = this;

        this.avatar = avatar;

        // scale image and get the blob now
        var img = document.getElementById('previewAvatar');
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;

        var imageDimensionRatio = img.width / img.height;
        var canvasDimensionRatio = canvas.width / canvas.height;
        var renderableHeight, renderableWidth, xStart, yStart;

        if (imageDimensionRatio > canvasDimensionRatio) {
            renderableHeight = canvas.height;
            renderableWidth = img.width * (renderableHeight / img.height);
            xStart = (canvas.width - renderableWidth) / 2;
            yStart = 0;
        } else if (imageDimensionRatio < canvasDimensionRatio) {
            renderableWidth = canvas.width;
            renderableHeight = img.height * (renderableWidth / img.width);
            xStart = 0;
            yStart = (canvas.height - renderableHeight) / 2;
        } else {
            renderableHeight = canvas.height;
            renderableWidth = canvas.width;
            xStart = 0;
            yStart = 0;
        }

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, xStart, yStart, renderableWidth, renderableHeight);

        canvas.toBlob(function (blob) {
            that.avatarBlob = blob;
        });
    };

    instance = new Wizard();
    return instance;
}]);

app.controller('StepController', ['$scope', '$location', 'Wizard', function ($scope, $location, Wizard) {
    $scope.wizard = Wizard;

    $scope.next = function (page, bad) {
        if (!bad) $location.path(page);
    };

    $scope.focusNext = function (elemId, bad) {
        if (!bad) $('#' + elemId).focus();
    };

    $scope.$on('$viewContentLoaded', function () {
        $('a[autofocus]').focus();
        $('input[autofocus]').focus();
    });

    $scope.showCustomAvatarSelector = function () {
        $('#avatarFileInput').click();
    };

    // cheap way to detect if we are in avatar and name selection step
    if ($('#previewAvatar').get(0) && $('#avatarFileInput').get(0)) {
        $('#avatarFileInput').get(0).onchange = function (event) {
            var fr = new FileReader();
            fr.onload = function () {
                $scope.$apply(function () {
                    var tmp = {
                        file: event.target.files[0],
                        data: fr.result,
                        url: null
                    };

                    $scope.wizard.availableAvatars.push(tmp);
                    $scope.wizard.setPreviewAvatar(tmp);
                });
            };
            fr.readAsDataURL(event.target.files[0]);
        };

        $scope.wizard.setPreviewAvatar($scope.wizard.availableAvatars[0]);
    }
}]);

app.controller('FinishController', ['$scope', '$location', '$timeout', 'Wizard', 'Client', function ($scope, $location, $timeout, Wizard, Client) {
    $scope.wizard = Wizard;

    function finish() {
        Client.createAdmin($scope.wizard.username, $scope.wizard.password, $scope.wizard.email, $scope.wizard.name, $scope.setupToken, function (error) {
            if (error) {
                console.error('Internal error', error);
                window.location.href = '/error.html';
                return;
            }

            Client.changeCloudronAvatar($scope.wizard.avatarBlob, function (error) {
                if (error) return console.error('Unable to set avatar.', error);

                window.location.href = '/';
            });
        });
    }

    $timeout(finish, 3000);
}]);

app.controller('SetupController', ['$scope', '$location', 'Client', 'Wizard', function ($scope, $location, Client, Wizard) {
    $scope.initialized = false;

    // Stupid angular location provider either wants html5 location mode or not, do the query parsing on my own
    var search = decodeURIComponent(window.location.search).slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});

    if (!search.setupToken) return window.location.href = '/error.html?errorCode=2';
    $scope.setupToken = search.setupToken;

    if (!search.email) return window.location.href = '/error.html?errorCode=3';
    Wizard.email = search.email;

    Wizard.hostname = window.location.host.indexOf('my-') === 0 ? window.location.host.slice(3) : window.location.host;

    Client.isServerFirstTime(function (error, isFirstTime) {
        if (error) {
            window.location.href = '/error.html';
            return;
        }

        if (!isFirstTime) {
            window.location.href = '/';
            return;
        }

        $location.path('/step1');

        $scope.initialized = true;
    });
}]);
