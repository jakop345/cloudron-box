'use strict';

angular.module('Application').controller('SupportController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {


    $scope.feedback = {
        error: null,
        success: false,
        busy: false,
        subject: '',
        description: ''
    };

    $scope.ticket = {
        error: null,
        success: false,
        busy: false,
        subject: '',
        description: ''
    };

    function resetFeedback() {
        $scope.feedback.subject = '';
        $scope.feedback.description = '';

        $scope.feedbackForm.$setUntouched();
        $scope.feedbackForm.$setPristine();
    }

    function resetTicket() {
        $scope.ticket.subject = '';
        $scope.ticket.description = '';

        $scope.ticketForm.$setUntouched();
        $scope.ticketForm.$setPristine();
    }

    $scope.submitFeedback = function () {
        $scope.feedback.busy = true;
        $scope.feedback.success = false;
        $scope.feedback.error = null;

        Client.feedback($scope.feedback.subject, $scope.feedback.description, function (error) {
            if (error) {
                $scope.feedback.error = error;
            } else {
                $scope.feedback.success = true;
                resetFeedback();
            }

            $scope.feedback.busy = false;
        });
    };

    $scope.submitTicket = function () {
        $scope.ticket.busy = true;
        $scope.ticket.success = false;
        $scope.ticket.error = null;

        Client.ticket($scope.ticket.subject, $scope.ticket.description, function (error) {
            if (error) {
                $scope.ticket.error = error;
            } else {
                $scope.ticket.success = true;
                resetTicket();
            }

            $scope.ticket.busy = false;
        });
    };
}]);
