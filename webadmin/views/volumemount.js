/* exported VolumeMountController */

'use strict';

function VolumeMountController ($scope, $routeParams, Client) {
    if (!$routeParams.volume || !$routeParams.volumeName) return window.location.replace('#/volumelist');

    $scope.volume = {};
    $scope.volume.id = $routeParams.volume;
    $scope.volume.name = $routeParams.volumeName;
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        $scope.error.password = null;
        $scope.disabled = true;

        Client.mount($scope.volume.id, $scope.volume.password, function (error) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.error.password = 'Password is wrong';
                    $scope.volume.password = '';
                    $scope.disabled = false;
                }

                console.error('Unable to mount volume.', error);
                return;
            }

            window.location.replace('#/volumelist');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
