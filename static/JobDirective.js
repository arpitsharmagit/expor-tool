(function( ng, app ) {
  var _ = window._,
      Q = window.Q;

  var StatusProgressTypeMap = {
    waiting: 'info',
    active: 'info',
    complete: 'success',
    failed: 'danger',
    cancelled: 'warning',
    ignore: 'warning'
  };


  app.directive('vbUptask', function () {
    return {
      restrict: 'E',
      require: '^vbJob',
      templateUrl: 'partials/vb-upload-task.html',
      scope: {
        task: '=',
        taskLabel: '='
      },
      controllerAs: 'taskctrl',
      link: function ($scope, element, attrs, jobCtrl) {
        $scope.ignore = jobCtrl.ignore.bind($scope.task);
        $scope.cancel = jobCtrl.cancel.bind($scope.task);
        $scope.StatusProgressTypeMap = StatusProgressTypeMap;

        $scope.archive = function (taskId) {
          $scope.$destroy();
          $(element).empty();
        };

        jobCtrl.addTaskListeners($scope.task, $scope);

      }
    };
  });

  app.directive('vbJob', function () {
    return {
      restrict: 'E',
      scope: {
        job: '=',
        content: '=',
        taskId: '=',
        videoId: '=',
        vendorId: '='
      },
      templateUrl: 'partials/vb-job.html',
      controllerAs: 'jobCtrl',
      controller: function ($scope, $rootScope, EventChannelService) {
        var job = $scope.job,
            self = this;

        // FIXME this is a hack to make sure that jobs are updated after not being updated in a while
        var periodicUpdate = _.throttle(function () {
          if (!$scope.$$phase) $scope.$apply();
        }, 500);

        $scope.StatusProgressTypeMap = StatusProgressTypeMap;


        $scope.$watch(function(scope) { return scope.job; }, function (nVal, oVal) {
        });

        // add update events for task
        EventChannelService.on('update.' + job.taskId, function (property, value) {
          job[property] = value;
          if (property === 'status' && value === 'complete') {
            job.progress = 1;
            job.statistics.progress = 1;
            job.statistics.current = null;
          }
          if (!$scope.$$phase) $scope.$apply();
        });
        EventChannelService.on('progress.' + job.taskId, function (statistics) {
          _.merge(job.statistics, statistics);
          $scope.progress = job.statistics.progress;
          periodicUpdate();

        });



        $scope.archive = function (taskId) {
          // FIXME just ignoring results for now
          EventChannelService.send('task.archive', taskId).done();
          self.removeTaskListeners(job);
          _.each(job.tasks, function (task) {
            self.removeTaskListeners(task.taskId);
          });
          $scope.$destroy();
        };

        _.each(job.tasks, function (task, key) {
          task.label = _.isNumber(key) ? task.type : key;
          // add update events for task

        });

        var childScopes = [];
        function updateChildren () {
          _.each(childScopes, function (childScope) {
            if (!childScope.$$phase) childScope.$apply();
          });
        }

        this.addTaskListeners = function (task, taskScope) {

          EventChannelService.on('update.' + task.taskId, function (prop, value) {
            task[prop] = value;
            if (!taskScope.$$phase) taskScope.$apply();
            periodicUpdate();
          });
          EventChannelService.on('progress.' + task.taskId, function (event, statistics) {
            _.assign(task.statistics, statistics);
            taskScope.progress = task.statistics.progress;
            if (!taskScope.$$phase) taskScope.$apply();
            periodicUpdate(); // update parent too
          });

          childScopes.push(taskScope);

        };
        this.addTaskListeners(job, $scope);

        this.removeTaskListeners = function (task) {
          EventChannelService.removeAllListeners('update.' + task.taskId);
          EventChannelService.removeAllListeners('progress.' + task.taskId);

          childScopes = [];
        };

        $scope.hideDetails = true;
        $scope.toggleDetails = function () {
          var showChildDetails = false;

          $scope.hideDetails = !$scope.hideDetails;
          if (!$scope.hideDetails) {
            EventChannelService.send('task.refresh', job.taskId, showChildDetails)
              .then(function (details) {

                _.assign(job, details);
                _.merge(job.tasks || {}, details.tasks);
                $scope.progress = job.statistics.progress;
                updateChildren();

                if (!$scope.$$phase) $scope.$apply();
                periodicUpdate();
              })
              .catch(function (err) {
                console.log('error getting job refresh', err);
              });
          }
        };


        this.ignore = function (taskId, shouldIgnore) {
          var self = this,
              eventName = shouldIgnore ? 'task.ignore' : 'task.enable',
              childTaskId;

          if (taskId !== job.taskId) {
            childTaskId = taskId;
            taskId = job.taskId;
          }
          console.log('ignoring', taskId, childTaskId);

          EventChannelService.send(eventName, taskId, childTaskId)
            .then(function () {
              self.ignore = shouldIgnore;
            })
            .catch(function (err) {
              self.issues.push(err);
              console.log(err);
            });

        };

        this.cancel = function (taskId) {
          var self = this,
              childTaskId;

          if (taskId !== job.taskId) {
            childTaskId = taskId;
            taskId = job.taskId;
          }

          EventChannelService.send('task.cancel', taskId, childTaskId)
            .then(function () {
              console.log('cancelled', this);
              self.status = 'cancelled';
            })
            .catch(function (err) {
              self.issues.push(err);
              console.log(err);
            });

        };

        $scope.ignore = this.ignore.bind(job);
        $scope.cancel = this.cancel.bind(job);

      }
    };
  });


})( angular, migrateApp );
