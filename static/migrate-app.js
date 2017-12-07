'use strict';
// jshint: browser:true
/* global angular:true, window:true, _:true, Q:true */

var migrateApp = angular.module('migrateApp', ['ui.bootstrap', 'ui.codemirror']);
if (typeof window !== 'undefined') {
  window.migrateApp = migrateApp;
}

migrateApp.filter('searchForContent', function(){
    return function(arr, searchString){
        if(!searchString){
            return arr;
        }
        var result = [];
        searchString = searchString.toLowerCase();
        angular.forEach(arr, function(item){
            if(item.title.toLowerCase().indexOf(searchString) !== -1){
            result.push(item);
        }
        });
        return result;
    };
});

migrateApp.controller('DataCtrl', ['$scope', '$rootScope', 'EventChannelService', function ($scope, $rootScope, EventChannelService) {

  $scope.contentSearchText = '';
  $scope.loadContent = function () {
    EventChannelService
      .send('db.content.search', $scope.contentSearchText, 'title')
      .then(function (results) {
        $scope.contentSearchText = '';
        $scope.data.content = results;
        if (!$scope.$$phase) $scope.$apply();
      })
      .catch(function (err) {
        console.warn(err);
      });
  };

  $scope.data = {
    content: [],
    user: {},
    team: {},
    category: {},
    job: {}
  };

  EventChannelService.on('data.empty', function () {
    $scope.data = {
      content: [],
      user: {},
      team: {},
      category: {},
      job: {}
    };
    if (!$scope.$$phase) $scope.$apply();
  });

  $scope.$on('data', function (event, args) {
    var type = args.type,
        data = args.data;

    if (type === 'content') {
      $scope.data.content.push(data);

    } else if (type === 'categories') {
      _.each(data, function (item) {
        item.prettyCategories = _.pluck(item.categories, 'name').join(' | ');
        $scope.data.category[item.path] = item;
      });
    } else if (type === 'job' || type === 'task') {
      $scope.data.job[data.taskId] = data;
      $rootScope.$broadcast('job.' + data.type, data);

    } else if (type === 'user') {
      $scope.data.user[data.username] = data;
    } else if (type === 'category') {
      $scope.data.category[data.path] = data;
    } else if (type === 'team') {
      $scope.data.team[data.vendorId] = data;
    } else {
      console.log('unknown data', args);
    }

    if (!$scope.$$phase) $scope.$apply();
  });

  $scope.$on('job.ContentJob', function (event, job) {
    $scope.data.job[job.taskId] = job;
    EventChannelService.on('update.' + job.taskId, function (property, value) {
      if (property === 'status' && value === 'archived') {
        console.log('archiving task', job.taskId);
        delete $scope.data.job[job.taskId];
        if (!$scope.$$phase) $scope.$apply();
      }
    });
    if (!$scope.$$phase) $scope.$apply();
  });

  /*
  ipc.on('progress', function (taskId, statistics) {
    var task = $scope.data.job[taskId];

    if (task) {
      task.progress = statistics.progress;
      task.current = statistics.current;
    }
  });
  */

}]);

migrateApp.factory('EventChannelService',
  ['$rootScope', function ($rootScope) {
    var ipc, listeners = {};

    if (typeof require !== 'undefined') {
      ipc = window.ipc = require('ipc');

      var oldEmit = ipc.emit;

      ipc.emit = function (eventType) {
        if (eventType !== '*' && eventType !== 'ipc.message') {
          oldEmit.apply(ipc, ['*'].concat(Array.prototype.slice.call(arguments)));
        }
        return oldEmit.apply(ipc, arguments);
      };

    } else {
      ipc = window.ipc = {
        on: function (eventType, listener) {
          (listeners[eventType] = listeners[eventType] || [])
              .push(listener);
          return ipc;
        },
        once: function (eventType, listener) {
          function wrappedListener() {
              listener.apply(ipc.off(eventType, wrappedListener), arguments);
          }
          wrappedListener.h = listener;
          return ipc.on(eventType, wrappedListener);
        },
        one: function (eventType, listener) {
          return ipc.once.apply(ipc, arguments);
        },
        off: function (eventType, listener) {
          for (var list = listeners[eventType], i = 0; listener && list && list[i]; i++) {
              list[i] != listener && list[i].h != listener || list.splice(i--,1);
          }
          if (!i) {
              delete listeners[eventType];
          }
          return ipc;
        },
        removeListener: function () {
          return ipc.off.apply(ipc, arguments);
        },
        removeAllListeners: function (eventType) {
          delete listeners[eventType];
          return ipc;
        },
        send: function () {
          var args = Array.prototype.slice.call(arguments);
          console.log('send:' + JSON.stringify(args));
          return ipc;
        },
        emit: function (eventType) {
          if (eventType !== '*' && eventType !== 'ipc.message' && eventType !== 'log') {
            ipc.emit.apply(ipc, ['*'].concat(Array.prototype.slice.call(arguments)));
          }
          for(var list = listeners[eventType], i = 0; list && list[i]; ) {
              list[i++].apply(ipc, list.slice.call(arguments, 1));
          }
          return ipc;
        }
      };
    }

    function broadcastData (dataType, data) {
      if (/^(category|categories|content|user|job|team|task)$/.test(dataType)) {
        $rootScope.$broadcast('data', {
          type: dataType,
          data: data
        });
        return;
      }

    }
    ipc.on('data', broadcastData);
    ipc.on('export', broadcastData);

    ipc.on('job', function (job) {
      $rootScope.$broadcast('job.' + job.type, job);
    });

    // debugging - show all messages
    ipc.on('*', function (eventName) {
      if (eventName !== 'log') console.log.apply(console);
    });

    ipc.on('ipc.message', function (data) {
      var args = JSON.parse(data);
      return ipc.emit.apply(ipc, args);
    });


    function EventChannelService (ipc) {
      var self = this;

      this.timeout = 3 * 60 * 1000;

      this.ipc = ipc;
      _.each(['on', 'once', 'removeListener', 'emit', 'removeAllListeners'], function (key) {
        self[key] = ipc[key].bind(ipc);
      });
      self.off = self.removeListener;

      this.send = function (eventName) {
        var defer = Q.defer(), promise;
        ipc.once.call(ipc, eventName + '.response', defer.makeNodeResolver());
        ipc.send.apply(ipc, arguments);
        self.waitingForResponse = true;

        promise = defer.promise.timeout(self.timeout);
        promise.finally(function () {
          self.waitingForResponse = false;
          return undefined;
        });
        return promise;
      };


    }
    var service = new EventChannelService(ipc);

    return service;
  }]);
