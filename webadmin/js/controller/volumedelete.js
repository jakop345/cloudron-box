'use strict';

function VolumeDeleteController ($scope, $routeParams, client, gui, syncerManager) {
    console.debug('VolumeDeleteController');

    if (!$routeParams.volume) {
        console.error('No volume provided.');
        return window.location.replace('#/maintabview');
    }

    $scope.volumeName = $routeParams.volume;

    $scope.volume = {};
    $scope.volume.name = '';
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to delete volume', $scope.volume.name, 'on', client.server);

        $scope.error.name = null;
        $scope.error.password = null;

        if ($scope.volume.name !== $scope.volumeName) {
            $scope.error.name = 'Volume names do not match.';
            return;
        }

        $scope.disabled = true;
        client.unmount($scope.volume.name, $scope.volume.password, function (error, result) {
            if (error) {
                console.warn('Error unmounting the volume', error);
                // in this case we still try to delete the volume
            }

            client.deleteVolume($scope.volume.name, $scope.volume.password, function (error, result) {
                if (error) {
                    if (error.statusCode === 403) {
                        $scope.$apply(function () {
                            $scope.error.password = 'Password is wrong';
                            $scope.volume.password = '';
                            $scope.disabled = false;
                        });
                    }

                    console.error('Unable to delete volume.', error);
                    return;
                }

                // TODO is this the correct place?
                syncerManager.deleteSyncer($scope.volume.name);

                console.debug('Successfully deleted volume', $scope.volume.name);
                window.location.replace('#/maintabview');
            });
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

