/* exported VolumeDeleteController */

'use strict';

function VolumeDeleteController ($scope, $routeParams, Client) {
    if (!$routeParams.volume || !$routeParams.volumeName) {
        return window.location.replace('#/volumelist');
    }

    $scope.volumeId = $routeParams.volume;
    $scope.volumeName = $routeParams.volumeName;

    $scope.volume = {};
    $scope.volume.name = '';
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        if ($scope.volume.name !== $scope.volumeName) {
            $scope.error.name = 'Volume names do not match.';
            return;
        }

        $scope.disabled = true;
        Client.unmount($scope.volumeId, $scope.volume.password, function () {
            // ignore error, try to delete volume regardless

            Client.deleteVolume($scope.volumeId, $scope.volume.password, function (error) {
                if (error) {
                    if (error.statusCode === 403) {
                        $scope.error.password = 'Password is wrong';
                        $scope.volume.password = '';
                        $scope.disabled = false;
                    }

                    return;
                }

                window.location.replace('#/volumelist');
            });
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

