'use strict';
/*global angular, _*/
/*jslint browser:true*/

angular.module('migrateApp', ['ui.bootstrap', 'ui.codemirror'])
  .factory('DataService', function ($rootScope) {
    var content = [],
        user = {},
        team = {},
        category = {},
        job = {},
        service = {
          content: content,
          user: user,
          team: team,
          catetgory: category,
          job: job
        };

    function addData (args) {
      var type = args.type,
          data = args.data;

      switch (type) {
        case 'content':
          content.push(data);
          break;
        case 'categories':
          _.each(data, function (item) {
            item.prettyCategories = _.pluck(item.categories, 'name').join(' | ');
            category[item.path] = item;
          });
        break;
        case 'job':
        case 'task':
          job[data.taskId] = data;
          $rootScope.$broadcast('job.' + data.type, data);
        break;
        case 'user':
          user[data.username] = data;
        break;  
        case 'category':
          data.prettyCategories = _.pluck(data.categories, 'name').join(' | ');
          category[data.path] = data;
        break;
        case 'team':
          team[data.vendorId] = data;
        break;
      }
    }

    $rootScope.$on('data', function (event, args) {
      addData(args);
    });

    return service;
  });
