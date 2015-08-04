'use strict';

angular.module('Application').controller('SupportController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {

    $scope.busy = false;

    $scope.feedback = {
        error: null,
        success: false,
        subject: '',
        description: ''
    };

    $scope.ticket = {
        error: null,
        success: false,
        subject: '',
        description: ''
    };

    $scope.submitFeedback = function () {
        $scope.busy = true;
        $scope.feedback.success = false;
        $scope.feedback.error = null;

        Client.feedback($scope.feedback.subject, $scope.feedback.description, function (error) {
            if (error) {
                $scope.feedback.error = error;
            } else {
                $scope.feedback.success = true;
            }

            $scope.busy = false;
        });
    };

    $scope.submitTicket = function () {
        $scope.busy = true;
        $scope.ticket.success = false;
        $scope.ticket.error = null;

        Client.ticket($scope.ticket.subject, $scope.ticket.description, function (error) {
            if (error) {
                $scope.ticket.error = error;
            } else {
                $scope.ticket.success = true;
            }

            $scope.busy = false;
        });
    };
}]);
