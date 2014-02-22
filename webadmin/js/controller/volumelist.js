'use strict';

function VolumeListController ($scope, $modal, client, syncerManager, Config) {
    console.debug('VolumeListController');

    $scope.volumes = [];

    function setVolumeState(volume, state) {
        $scope.$apply(function () {
            volume.active = state;
        });
    }

    function refresh() {
        console.debug('refresh volume list');

        client.listVolumes(function (error, result) {
            if (error) {
                console.error('Unable to get volume listing.', error);
                return;
            }

            // amend volume properties depending on the environment
            result.forEach(function (volume) {
                var syncer = syncerManager.getSyncer(volume.name);
                if (syncer) {
                    volume.syncDir = syncer.config.get('path', '');

                    // check initial state
                    if (syncer.process) volume.active = true;

                    syncer.emitter.on('start', setVolumeState.bind(null, volume, true));
                    syncer.emitter.on('finish', setVolumeState.bind(null, volume, false));
                }
            });

            console.debug('Got new volume list', result);

            $scope.$apply(function () {
                $scope.volumes = result;
            });
        });
    }

    $scope.createVolume = function () {
        window.location.href = '#/volumecreate';
    };

    $scope.deleteVolume = function (volume) {
        // TODO urlencode?
        window.location.href = '#/volumedelete?volume=' + volume;
    };

    $scope.mountVolume = function (volume) {
        // TODO urlencode?
        window.location.href = '#/volumemount?volume=' + volume;
    };

    $scope.unmountVolume = function (volume) {
        // TODO urlencode?
        window.location.href = '#/volumeunmount?volume=' + volume;
    };

    $scope.unbindSyncDirectory = function (volume) {
        var modalInstance = $modal.open({
            templateUrl: 'volumeUnbindTemplate.html',
            controller: VolumeUnbindController,
            resolve: {
                volume: function () { return volume.name; },
                folder: function () { return volume.syncDir; }
            }
        });

        modalInstance.result.then(function () {
            console.debug('now unbind folder', volume.syncDir, 'from volume', volume.name);
            syncerManager.deleteSyncer(volume.name);
            volume.syncDir = null;
        }, function () {
            console.info('Volume unbind modal dismissed.');
        });
    };

    $scope.bindSyncDirectory = function (volumeName) {
        var fileDialog = window.document.getElementById(volumeName + 'FileDialog');

        // Override the event handler every time
        fileDialog.onchange = function (event) {
            var folder = this.value;

            var modalInstance = $modal.open({
                templateUrl: 'volumeSyncFolderTemplate.html',
                controller: VolumeSyncFolderController,
                resolve: {
                    volume: function () { return volumeName; },
                    folder: function () { return folder; }
                }
            });

            modalInstance.result.then(function () {
                console.debug('now start sync with folder', folder);

                var config = new Config(volumeName);
                config.set('path', folder);

                var syncer = syncerManager.addSyncer(volumeName, config);
                var volumeObject;

                for (var i = 0; i < $scope.volumes.length; ++i) {
                    if ($scope.volumes[i].name === volumeName) {
                        volumeObject = $scope.volumes[i];
                        break;
                    }
                }

                if (!volumeObject) {
                    console.error('Unknown volume');
                    return;
                }

                volumeObject.syncDir = syncer.config.get('path', '');

                // check initial state
                if (syncer.process) volumeObject.active = true;

                syncer.emitter.on('start', setVolumeState.bind(null, volumeObject, true));
                syncer.emitter.on('finish', setVolumeState.bind(null, volumeObject, false));

                syncerManager.startSyncer(volumeName);
            }, function () {
                console.info('Volume sync folder modal dismissed.');
            });
        };

        fileDialog.click();
    };

    refresh();
}

var VolumeSyncFolderController = function ($scope, $modalInstance, volume, folder) {
    $scope.volume = volume;
    $scope.folder = folder;

    $scope.ok = function () {
        $modalInstance.close();
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
};

var VolumeUnbindController = function ($scope, $modalInstance, volume, folder) {
    $scope.volume = volume;
    $scope.folder = folder;

    $scope.ok = function () {
        $modalInstance.close();
    };

    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
    };
};