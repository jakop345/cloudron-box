'use strict';

function VolumeUnmountController ($scope, $routeParams, Client) {
    console.debug('VolumeUnmountController');

    if (!$routeParams.volume || !$routeParams.volumeName) {
        console.error('No volume provided.');
        return window.location.replace('#/volumelist');
    }

    $scope.volume = {};
    $scope.volume.id = $routeParams.volume;
    $scope.volume.name = $routeParams.volumeName;
    $scope.volume.password = '';
    $scope.disabled = false;

    $scope.submit = function () {
        console.debug('Try to unmount volume %s.', $scope.volume.name);

        $scope.disabled = true;
        Client.unmount($scope.volume.id, $scope.volume.password, function (error, result) {
            if (error) {
                console.error('Unable to unmount volume.', error);
                $scope.disabled = false;
                return;
            }

            console.debug('Successfully unmounted volume', $scope.volume.name);
            window.location.replace('#/volumelist');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
