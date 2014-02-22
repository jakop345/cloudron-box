'use strict';

function VolumeCreateController ($scope, $routeParams, client) {
    console.debug('VolumeCreateController');

    $scope.volume = {};
    $scope.volume.name = '';
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to create volume', $scope.volume.name, 'on', client.server);

        $scope.error.name = null;
        $scope.error.password = null;

        if (!$scope.volume.name) {
            $scope.error.name = 'Volume name must not only contain spaces.';
            return;
        }

        $scope.disabled = true;
        client.createVolume($scope.volume.name, $scope.volume.password, function (error, result) {
            if (error) {
                console.error('Unable to create volume.', error);
                $scope.$apply(function () {
                    if (error.statusCode === 409) {
                        $scope.error.name = 'Volume with the name ' + $scope.volume.name + ' already exists.';
                    } else if (error.statusCode === 403) {
                        $scope.error.password = 'Wrong password provided.';
                        $scope.volume.password = '';
                    } else {
                        $scope.error.name = 'Volume with the name ' + $scope.volume.name + ' cannot be created.';
                    }
                    $scope.disabled = false;
                });
                return;
            }

            console.debug('Successfully created volume', $scope.volume.name);
            window.location.replace('#/maintabview');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
