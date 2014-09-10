/* exported VolumeListController */

'use strict';

function VolumeListController ($scope, Client) {
    $scope.volumes = [];

    $scope.getUsers = function (callback) {
        Client.listUsers(function (error, result) {
            if (error) return console.error('Unable to get user listing.', error);
            callback(result.users);
        });
    };

    function refresh() {
        Client.listVolumes(function (error, result) {
            if (error) return console.error('Unable to get volume listing.', error);
            $scope.volumes = result;
        });
    }

    $scope.createVolume = function () {
        window.location.href = '#/volumecreate';
    };

    $scope.deleteVolume = function (volume) {
        window.location.href = '#/volumedelete?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name);
    };

    $scope.mountVolume = function (volume) {
        window.location.href = '#/volumemount?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name);
    };

    $scope.unmountVolume = function (volume) {
        window.location.href = '#/volumeunmount?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name);
    };

    $scope.addUser = function (volume, password, user) {
        if (!user || !user.username) {
            return;
        }

        Client.addUserToVolume(user.username, volume.id, password, function (error) {
            if (error) {
                // TODO nice error reporting
                if (error.statusCode === 405) alert('Unknown user');
                if (error.statusCode === 401) alert('wrong password');

                console.error(error);

                return;
            }

            refresh();
        });
    };

    $scope.removeUser = function (volume, username) {
        window.location.href = '#/volumeremoveuser?volume=' + volume.id + '&volumeName=' + encodeURIComponent(volume.name) + '&userName=' + encodeURIComponent(username);
    };

    refresh();
}
