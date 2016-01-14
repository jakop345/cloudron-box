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
        this.setupToken = null;
        this.provider = null;
        this.availableAvatars = [{
            file: null,
            data: null,
            url: '/img/avatars/avatar_0.png',
        }, {
            file: null,
            data: null,
            url: '/img/avatars/rubber-duck.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/carrot.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cup.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/football.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/owl.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/space-rocket.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/armchair.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/cap.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/pan.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/meat.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/umbrella.png'
        }, {
            file: null,
            data: null,
            url: '/img/avatars/jar.png'
        }];
        this.avatar = {};
        this.avatarBlob = null;
        this.dnsConfig = null;
    }

    Wizard.prototype.setPreviewAvatar = function (avatar) {
        var that = this;

        this.avatar = avatar;

        // scale image and get the blob now. do not use the previewAvatar element here because it is not updated yet
        var img = document.createElement('img');
        img.src = avatar.data || avatar.url;
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

app.controller('StepController', ['$scope', '$route', '$location', 'Wizard', function ($scope, $route, $location, Wizard) {
    $scope.wizard = Wizard;

    $scope.next = function (bad) {
        if (bad) return;

        var current = $location.path();
        var next = '';

        if (current === '/step1') {
            next = '/step2';
        } else if (current === '/step2') {
            if (Wizard.dnsConfig === null) next = '/step4';
            else next = '/step3';
        } else if (current === '/step3') {
            next = '/step4';
        } else {
            next = '/step1';
        }

        $location.path(next);
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
    if ($route.current.templateUrl === 'views/setup/step1.html') {
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

        // ensure image got loaded before setting the preview avatar
        var image = document.createElement('img');
        var randomIndex = Math.floor(Math.random() * $scope.wizard.availableAvatars.length);
        image.onload = function() {
            $scope.$apply(function () { $scope.wizard.setPreviewAvatar($scope.wizard.availableAvatars[randomIndex]); });
            image = null;
        };
        image.src = $scope.wizard.availableAvatars[randomIndex].data || $scope.wizard.availableAvatars[randomIndex].url;
    } else if ($route.current.templateUrl === 'views/setup/step3.html' && Wizard.dnsConfig === null) {
        $location.path('/step4'); // not using custom domain
    }

}]);

app.controller('FinishController', ['$scope', '$location', 'Wizard', 'Client', function ($scope, $location, Wizard, Client) {
    $scope.wizard = Wizard;

    Client.createAdmin(Wizard.username, Wizard.password, Wizard.email, Wizard.setupToken, function (error) {
        if (error) {
            console.error('Internal error', error);
            window.location.href = '/error.html';
            return;
        }

        Client.changeCloudronAvatar($scope.wizard.avatarBlob, function (error) {
            if (error) return console.error('Unable to set avatar.', error);

            if ($scope.wizard.dnsConfig === null) {
                window.location.href = '/';
                return;
            }

            Client.setDnsConfig($scope.wizard.dnsConfig, function (error) {
                if (error) return console.error('Unable to set dns config.', error);

                window.location.href = '/';
            });
        });
    });
}]);

app.controller('SetupController', ['$scope', '$location', 'Client', 'Wizard', function ($scope, $location, Client, Wizard) {
    $scope.initialized = false;
    $scope.wizard = Wizard;

    // Stupid angular location provider either wants html5 location mode or not, do the query parsing on my own
    var search = decodeURIComponent(window.location.search).slice(1).split('&').map(function (item) { return item.split('='); }).reduce(function (o, k) { o[k[0]] = k[1]; return o; }, {});

    Client.getStatus(function (error, status) {
        if (error) {
            window.location.href = '/error.html';
            return;
        }

        if (status.activated) {
            window.location.href = '/';
            return;
        }

        if (status.provider === 'caas') {
            if (!search.setupToken) {
                window.location.href = '/error.html?errorCode=2';
                return;
            }

            if (!search.email) {
                window.location.href = '/error.html?errorCode=3';
                return;
            }

            if (search.customDomain === 'true') {
                Wizard.dnsConfig = {
                    provider: 'route53',
                    accessKeyId: null,
                    secretAccessKey: null
                };
            }

            Wizard.setupToken = search.setupToken;
        }

        Wizard.email = search.email;
        Wizard.requireEmail = !search.email;
        Wizard.provider = status.provider;

        $location.path('/step1');

        $scope.initialized = true;
    });
}]);
