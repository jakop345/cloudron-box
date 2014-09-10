/* exported VolumeCreateController */

'use strict';

function VolumeCreateController ($scope, $routeParams, Client) {
    $scope.volume = {};
    $scope.volume.name = '';
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        $scope.error.name = null;
        $scope.error.password = null;

        if (!$scope.volume.name) {
            $scope.error.name = 'Volume name must not only contain spaces.';
            return;
        }

        $scope.disabled = true;
        Client.createVolume($scope.volume.name, $scope.volume.password, function (error) {
            if (error) {
                if (error.statusCode === 409) {
                    $scope.error.name = 'Volume with the name ' + $scope.volume.name + ' already exists.';
                } else if (error.statusCode === 403) {
                    $scope.error.password = 'Wrong password provided.';
                    $scope.volume.password = '';
                } else {
                    $scope.error.name = 'Volume with the name ' + $scope.volume.name + ' cannot be created.';
                }
                $scope.disabled = false;
                return;
            }

            window.location.replace('#/volumelist');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
