'use strict';

function VolumeMountController ($scope, $routeParams, Client) {
    console.debug('VolumeMountController');

    if (!$routeParams.volume) {
        console.error('No volume provided.');
        return window.location.replace('#/maintabview');
    }

    $scope.volume = {};
    $scope.volume.name = $routeParams.volume;
    $scope.volume.password = '';
    $scope.disabled = false;
    $scope.error = {};

    $scope.submit = function () {
        console.debug('Try to mount volume', $scope.volume.name, 'on', Client.getServer());

        $scope.error.password = null;
        $scope.disabled = true;

        Client.mount($scope.volume.name, $scope.volume.password, function (error, result) {
            if (error) {
                if (error.statusCode === 403) {
                    $scope.error.password = 'Password is wrong';
                    $scope.volume.password = '';
                    $scope.disabled = false;
                }

                console.error('Unable to mount volume.', error);
                return;
            }

            console.debug('Successfully mounted volume', $scope.volume.name);
            window.location.replace('#/maintabview');
        });
    };

    $scope.cancel = function () {
        window.history.back();
    };
}
