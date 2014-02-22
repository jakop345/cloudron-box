'use strict';

function VolumeUnmountController ($scope, $routeParams, client, syncerManager) {
    console.debug('VolumeUnmountController');

    if (!$routeParams.volume) {
        console.error('No volume provided.');
        return window.location.replace('#/maintabview');
    }

    $scope.volume = {};
    $scope.volume.name = $routeParams.volume;
    $scope.volume.password = '';
    $scope.disabled = false;

    $scope.submit = function () {
        console.debug('Try to unmount volume', $scope.volume.name, 'on', client.getServer());

        var syncer = syncerManager.getSyncer($scope.volume.name);
        if (syncer) {
            console.info('Stop syncer before we try to unmount');
            syncer.stop();
        }

        $scope.disabled = true;
        client.unmount($scope.volume.name, $scope.volume.password, function (error, result) {
            if (error) {
                console.error('Unable to unmount volume.', error);
                $scope.disabled = false;
                return;
            }

            console.debug('Successfully unmounted volume', $scope.volume.name);
            window.location.replace('#/maintabview');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
