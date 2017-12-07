(function( ng, app ) {
  app.directive('vbContent', function () {
    return {
      restrict: 'E',
      templateUrl: 'partials/vb-content.html',
      controllerAs: 'ctrl',
      scope: {
        content: '='
      },
      controller: function ($scope, $attrs, EventChannelService) {
        $scope.markedForImport = false;
        //$scope.content.markedForImport = false;

        $scope.toggleContentImport = function () {
          if ($scope.content.markedForImport) {
            console.warn('NOT IMPLEMENTED', $scope.content);
          }
        };

      }
    };
  });

})( angular, migrateApp );
