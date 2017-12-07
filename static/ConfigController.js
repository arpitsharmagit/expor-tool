(function( ng, migrateApp ) {
  migrateApp.controller('ConfigCtrl', ['$scope', '$rootScope', '$window', 'EventChannelService', function ($scope, $rootScope, $window, EventChannelService) {
    var _ = $window._,
        Q = $window.Q,
        PROMISE_TIMEOUT = 30000;

    var config = $scope.config = {
      debugMode: true,
      options: {
        backupFolder: undefined,
        preferredWidth: undefined,
        defaultAuthor: undefined,
        pageSize: 50,
        continueOnError: false,
        autosave: false,
        batchSize: 100,
        ignoreFlags: {
          categories: false,
          video: false,
          image: false,
          attachments: false,
          comments: false,
          author: false,
          transcode: false,
          permissions: false
        }
      },
      rev: {
        url: '',
        username: '',
        password: '',
        proxy: undefined
        //uploadTimeoutInSeconds: 60 * 60 * 1, // one hour
        //routeTimeoutInSeconds: 60 * 5 // 5 min*/
      },
      sns: {
        username: '',
        password: '',
        url: '',
        proxy: undefined,
        pageSize: 50,
        pageStartOffset: 0,
        maxResults: 5000,
        maxPages: 2048,
        timeout: 60 * 5 * 1000
      },
      db: {
        folder: undefined,
        contentFilename: undefined,
        categoryFilename: undefined,
        teamsFilename: undefined,
        usersFilename: undefined,
        jobsFilename: undefined,
        allFilename: undefined,
        autosave: false,
        async: true
      }
    };


    function addLogEntry(severity, message, label, domain) {
      EventChannelService.emit('log', {
        severity: severity,
        domain: domain + ' ' + label,
        data: message
      });
      /*$scope.log.entries.push({
        domain: domain,
        severity: severity || '',
        message: message,
        label: label || ''
      });
      $scope.$apply();*/
    }

    var log = $scope.log = {
      entries: [],
      log: addLogEntry.bind($scope, ''),
      warn: addLogEntry.bind($scope, 'warn'),
      error: addLogEntry.bind($scope, 'error'),
      success: addLogEntry.bind($scope, 'success'),
      info: addLogEntry.bind($scope, 'info')
    };

    $scope.waitingForResponse = false;

    function send () {
      $scope.waitingForResponse = true;
      return EventChannelService.send.apply(EventChannelService, arguments)
        .finally(function () {
          $scope.waitingForResponse = false;
          $scope.$apply();
        });
    }

    function safeApply (fn) {
      if ($scope.$$phase) { // most of the time it is "$digest"
          fn();
      } else {
          $scope.$apply(fn);
      }
    }

    $scope.folder = {
      setDataFolder: function () {
        send('config.folder.data')
          .then(function (result) {
            safeApply(function () {
              log.success('export data will be stored in ' + result);
              $scope.config.db.folder = result;
            });
          })
          .catch( function (err) {
            log.error(err, 'data folder', 'config');
          });
      },
      setContentFolder: function () {
        send('config.folder.content')
          .then(function (result) {
            safeApply(function () {
              log.success('export data will be stored in ' + result);
              $scope.config.options.backupFolder = result;
            });
          })
          .catch( function (err) {
            log.error(err, 'data folder', 'config');
          });
      }
    };

    EventChannelService.on('config', function (serverConfig) {
      safeApply(function () {
        _.merge(config, serverConfig);
      });
    });

    $scope.updateConfig = function () {
      send('config.update', $scope.config)
        .catch( function (err) {
          addLogEntry('error', err, 'update', 'config');
        });
    };

    EventChannelService.on('config.debugMode', function (isEnabled) {
      if ($scope.config.debugMode !== isEnabled) {
        $scope.config.debugMode = isEnabled;
        if (!$scope.$$phase) $scope.$apply();
      }
    });

    $scope.toggleDebugMode = function () {
      //$scope.config.debugMode = !$scope.config.debugMode;
      send('config.debugMode', $scope.config.debugMode);
    };

    /* SNS */
    var sns = $scope.sns = {
      job: false,
      active: false,
      totalContent: 0,
      validConnection: false,
      testConnection: function () {
        send('sns.test')
          .then(function (result) {
            safeApply(function () {
              if (!result) result = { total: '???' };
              sns.totalContent = result.total;
              sns.validConnection = true;
              log.success('Connection valid, total content: ' + result.total, 'Test Connection', 'sns');
            });
          })
          .catch(function (error) {
            sns.validConnection = false;
            log.error(error, 'Test Connection', 'sns');
            safeApply(function () {});
            return false;
          });
      },
      start: function () {
        var options = config.sns;
        sns.active = true;
        send('sns.start', options)
          .then(function (job) {
            log.info('process begun', 'Export', 'sns');
          }).catch(function (err) {
            log.error(err, 'Export Failure', 'sns');
          });
      },
      cancel: function () {
        sns.active = false;
        send('sns.cancel');
      },
      log: []
    };

    $scope.$on('job.VendorExportJob', function (event, job) {
      var applyFn = function () {

        sns.job = job;

        EventChannelService.on('update.' + job.taskId, function (property, value) {
          if (property === 'status') {
            sns.active = (value === 'active');

            // remove from list if done
            if (value === 'archived') {
              sns.job = undefined;
            }

            if (value === 'complete') {
              try {
                sns.job.statistics.current = 'Export Complete.  Check output folder.';
                log.info('Process Complete.  Results have been saved to ' + $scope.config.db.folder);
              } catch (err) {
                console.error(err);
              }
            }
          }
        });
      };

      if ($scope.$$phase) { // most of the time it is "$digest"
          applyFn();
      } else {
          $scope.$apply(applyFn);
      }

    });

    /* SNS */
    var rev = $scope.rev = {
      job: false,
      active: false,
      validConnection: false,
      testConnection: function () {
        send('rev.test')
          .then(function () {
            safeApply(function () {
              rev.validConnection = true;
              log.success('Connection valid', 'Test Connection', 'rev');
            });
          })
          .catch(function (error) {
            safeApply(function () {
              rev.validConnection = false;
              log.error(error, 'Test Connection', 'rev');
            });
          }).done();
      },
      prepare: function () {
        send('rev.prepare')
          .then(function () {
            log.info('response from rev.prepare', Array.prototype.slice(arguments).join(','));
          }).catch(function (err) {
            log.error(err, 'Import Failure', 'rev');
          }).done();
      },
      start: function () {
        rev.active = true;
        send('rev.start')
          .then(function () {
            log.info('response from rev.start', arguments);

          }).catch(function (err) {
            log.error(err, 'Import Failure', 'rev');
          }).done();
      },
      cancel: function () {
        rev.active = false;
        send('rev.cancel').done();
      },
      log: []
    };

    $scope.$on('job.RevImportJob', function (event, job) {
      var applyFn = function () {
        rev.job = job;

        EventChannelService.on('update.' + job.taskId, function (property, value) {
          if (property === 'status') {
            rev.active = (value === 'active');

            // remove from list if done
            if (value === 'archived') {
              rev.job = undefined;
            }
          }
        });
      };

      if ($scope.$$phase) { // most of the time it is "$digest"
          applyFn();
      } else {
          $scope.$apply(applyFn);
      }
    });

    $scope.Math = window.Math;
    $scope.exportRange = function () {
      var pageSize = parseInt($scope.config.sns.pageSize, 10) || 50,
          pageOffset = parseInt($scope.config.sns.pageStartOffset, 10) || 0,
          maxResults = parseInt($scope.config.sns.maxResults, 10) || 5000,
          total = parseInt($scope.sns.totalContent, 10) || Infinity;

      var start = pageOffset * pageSize,
          end = Math.min(start + maxResults, total),
          output = 'Exporting videos ' + start + ' - ' + end;

      output += (total === Infinity) ? '' : ' of ' + total;
      return output;
    };

    //$scope.isCollapsed = true;

  }]);
})( angular, migrateApp );
