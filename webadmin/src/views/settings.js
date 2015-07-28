'use strict';

angular.module('Application').controller('SettingsController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    Client.onReady(function () { if (!Client.getUserInfo().admin) $location.path('/'); });

    $scope.user = Client.getUserInfo();
    $scope.config = Client.getConfig();

    $scope.lastBackup = null;
    $scope.backups = [];
    $scope.avatar = {
        data: null,
        url: null
    };

    $scope.developerModeChange = {
        busy: false,
        error: {},
        password: ''
    };

    $scope.createBackup = {
        busy: false,
        percent: 100
    };

    $scope.nameChange = {
        busy: false,
        error: {},
        name: ''
    };

    $scope.avatarChange = {
        busy: false,
        error: {},
        avatar: null,
        availableAvatars: [{
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
        }]
    };

    $scope.setPreviewAvatar = function (avatar) {
        $scope.avatarChange.avatar = avatar;
    };

    $scope.showCustomAvatarSelector = function () {
        $('#avatarFileInput').click();
    };

    function nameChangeReset() {
        $scope.nameChange.error.name = null;
        $scope.nameChange.name = '';

        $scope.nameChangeForm.$setPristine();
        $scope.nameChangeForm.$setUntouched();
    }

    function avatarChangeReset() {
        $scope.avatarChange.error.avatar = null;
        $scope.avatarChange.avatar = null;
        $scope.avatarChange.busy = false;
    }

    function fetchBackups() {
        Client.getBackups(function (error, backups) {
            if (error) return console.error(error);

            $scope.backups = backups;

            if ($scope.backups.length > 0) {
                $scope.lastBackup = backups[0];
            } else {
                $scope.lastBackup = null;
            }
        });
    }

    function developerModeChangeReset () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.password = '';

        $scope.developerModeChangeForm.$setPristine();
        $scope.developerModeChangeForm.$setUntouched();
    }

    $scope.doChangeDeveloperMode = function () {
        $scope.developerModeChange.error.password = null;
        $scope.developerModeChange.busy = true;

        Client.changeDeveloperMode(!$scope.config.developerMode, $scope.developerModeChange.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.developerModeChange.error.password = true;
                    $scope.developerModeChange.password = '';
                    $('#inputDeveloperModeChangePassword').focus();
                } else {
                    console.error('Unable to change developer mode.', error);
                }
            } else {
                developerModeChangeReset();

                $('#developerModeChangeModal').modal('hide');
            }

            $scope.developerModeChange.busy = false;
        });
    };

    $scope.doChangeName = function () {
        $scope.nameChange.error.name = null;
        $scope.nameChange.busy = true;

        Client.changeCloudronName($scope.nameChange.name, function (error) {
            if (error) {
                console.error('Unable to change name.', error);
            } else {
                nameChangeReset();
                $('#nameChangeModal').modal('hide');
            }

            $scope.nameChange.busy = false;
        });
    };

    function getBlobFromImg(img, callback) {
        var size = 256;

        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

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

        canvas.toBlob(callback);
    }

    $scope.doChangeAvatar = function () {
        $scope.avatarChange.error.avatar = null;
        $scope.avatarChange.busy = true;

        var img = document.getElementById('previewAvatar');
        $scope.avatarChange.avatar.file = getBlobFromImg(img, function (blob) {
            Client.changeCloudronAvatar(blob, function (error) {
                if (error) {
                    console.error('Unable to change developer mode.', error);
                } else {
                    // Do soft reload, since the browser will not update the avatar URLs in the UI
                    window.location.reload();
                }

                $scope.avatarChange.busy = false;
            });
        });
    };

    $scope.doCreateBackup = function () {
        $('#createBackupModal').modal('hide');
        $scope.createBackup.busy = true;
        $scope.createBackup.percent = 100;

        Client.backup(function (error) {
            if (error) {
                console.error(error);
                $scope.createBackup.busy = false;
            }

            function checkIfDone() {
                Client.progress(function (error, data) {
                    if (error) return window.setTimeout(checkIfDone, 250);

                    // check if we are done
                    if (!data.backup || data.backup.percent >= 100) {
                        fetchBackups();
                        $scope.createBackup.busy = false;
                        return;
                    }

                    $scope.createBackup.percent = data.backup.percent;
                    window.setTimeout(checkIfDone, 250);
                });
            }

            checkIfDone();
        });
    };

    $scope.showChangeDeveloperMode = function () {
        developerModeChangeReset();
        $('#developerModeChangeModal').modal('show');
    };

    $scope.showChangeName = function () {
        nameChangeReset();
        $('#nameChangeModal').modal('show');
    };

    $scope.showCreateBackup = function () {
        $('#createBackupModal').modal('show');
    };

    $scope.showChangeAvatar = function () {
        avatarChangeReset();
        $('#avatarChangeModal').modal('show');
    };

    $('#avatarFileInput').get(0).onchange = function (event) {
        var fr = new FileReader();
        fr.onload = function () {
            $scope.$apply(function () {
                var tmp = {
                    file: event.target.files[0],
                    data: fr.result,
                    url: null
                };

                $scope.avatarChange.availableAvatars.push(tmp);
                $scope.setPreviewAvatar(tmp);
            });
        };
        fr.readAsDataURL(event.target.files[0]);
    };

    Client.onReady(function () {
        fetchBackups();

        $scope.avatar.url = '//my-' + $scope.config.fqdn + '/api/v1/cloudron/avatar';
    });

    // setup all the dialog focus handling
    ['developerModeChangeModal', 'nameChangeModal'].forEach(function (id) {
        $('#' + id).on('shown.bs.modal', function () {
            $(this).find("[autofocus]:first").focus();
        });
    });
}]);
