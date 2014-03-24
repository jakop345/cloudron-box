'use strict';

function VolumeListController ($scope, $modal, Client) {
    console.debug('VolumeListController');

    $scope.volumes = [];

    function refresh() {
        console.debug('refresh volume list');

        Client.listVolumes(function (error, result) {
            if (error) {
                console.error('Unable to get volume listing.', error);
                return;
            }

            console.debug('Got new volume list', result);
            $scope.volumes = result;
        });
    }

    $scope.createVolume = function () {
        window.location.href = '#/volumecreate';
    };

    $scope.deleteVolume = function (volume) {
        window.location.href = '#/volumedelete?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name);
    };

    $scope.mountVolume = function (volume) {
        window.location.href = '#/volumemount?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name);
    };

    $scope.unmountVolume = function (volume) {
        window.location.href = '#/volumeunmount?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name);
    };

    $scope.addUser = function (volume, password, username) {
        if (!username) {
            return;
        }

        Client.addUserToVolume(username, volume.id, password, function (error) {
            if (error) {
                // TODO nice error reporting
                if (error.statusCode === 405) alert('Unknown user');
                if (error.statusCode === 401) alert('wrong password');

                console.error(error);

                return;
            }

            window.location.reload();
        });
    };

    refresh();
}
