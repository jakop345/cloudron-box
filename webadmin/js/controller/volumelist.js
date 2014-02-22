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

    refresh();
}
