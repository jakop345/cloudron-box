'use strict';

angular.module('Application').controller('SupportController', ['$scope', '$location', 'Client', function ($scope, $location, Client) {
    $scope.config = Client.getConfig();

    $scope.feedback = {
        error: null,
        success: false,
        busy: false,
        subject: '',
        type: '',
        description: ''
    };

    function resetFeedback() {
        $scope.feedback.subject = '';
        $scope.feedback.description = '';
        $scope.feedback.type = '';

        $scope.feedbackForm.$setUntouched();
        $scope.feedbackForm.$setPristine();
    }

    $scope.submitFeedback = function () {
        $scope.feedback.busy = true;
        $scope.feedback.success = false;
        $scope.feedback.error = null;

        Client.feedback($scope.feedback.type, $scope.feedback.subject, $scope.feedback.description, function (error) {
            if (error) {
                $scope.feedback.error = error;
            } else {
                $scope.feedback.success = true;
                resetFeedback();
            }

            $scope.feedback.busy = false;
        });
    };
}]);
