'use strict';

function VolumeDeleteController ($scope, $routeParams, Client) {
    console.debug('VolumeDeleteController');

    if (!$routeParams.volume || !$routeParams.volumeName) {
        console.error('No volume provided.');
        return window.location.replace('#/maintabview');
    }

    $scope.volumeId = $routeParams.volume;
    $scope.volumeName = $routeParams.volumeName;

    $scope.volume = {};
    $scope.volume.name = '';
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to delete volume %s.', $scope.volume.name);

        $scope.error.name = null;
        $scope.error.password = null;

        if ($scope.volume.name !== $scope.volumeName) {
            $scope.error.name = 'Volume names do not match.';
            return;
        }

        $scope.disabled = true;
        Client.unmount($scope.volumeId, $scope.volume.password, function (error, result) {
            if (error) {
                console.warn('Error unmounting the volume', error);
                // in this case we still try to delete the volume
            }

            Client.deleteVolume($scope.volumeId, $scope.volume.password, function (error, result) {
                if (error) {
                    if (error.statusCode === 403) {
                        $scope.error.password = 'Password is wrong';
                        $scope.volume.password = '';
                        $scope.disabled = false;
                    }

                    console.error('Unable to delete volume.', error);
                    return;
                }

                console.debug('Successfully deleted volume', $scope.volume.name);
                window.location.replace('#/maintabview');
            });
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

