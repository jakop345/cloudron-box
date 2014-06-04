'use strict';

function VolumeRemoveUserController ($scope, $routeParams, Client) {
    if (!$routeParams.volume || !$routeParams.volumeName) {
        console.error('No volume provided.');
        return window.location.replace('#/volumelist');
    }

    if (!$routeParams.userName) {
        console.error('No username provided.');
        return window.location.replace('#/volumelist');
    }

    $scope.volumeId = $routeParams.volume;
    $scope.volumeName = $routeParams.volumeName;
    $scope.userName = $routeParams.userName;

    $scope.volume = {};
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to remove user %s from volume %s.', $scope.userName, $scope.volumeName);

        $scope.error.password = null;

        $scope.disabled = true;

        Client.removeUserFromVolume($scope.userName, $scope.volumeId, $scope.volume.password, function (error, result) {
            if (error) {
                if (error.statusCode === 401) {
                    $scope.error.password = 'Password is wrong';
                    $scope.volume.password = '';
                    $scope.disabled = false;
                }

                console.error('Unable to remove user from volume.', error);
                return;
            }

            console.debug('Successfully removed user from volume', $scope.volumeName);
            window.location.replace('#/volumelist');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}

