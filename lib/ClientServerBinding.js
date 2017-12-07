'use babel';
'use strict';

var Q = require('q'),
    _ = require('lodash'),
    Logger = require('./util/Logger'),
    _private = require('./util/private-store').create(),
    vm = require('vm');


class ClientServerBinding {
  constructor (migrate, ipc, serverSend) {
    this.loggingEnabled = false;

    _private(this, {
      migrateApp: migrate,
      ipc: ipc,
      clientListeners: [],
      serverListeners: []
    });

    if (migrate && ipc && serverSend) {
      this.init(migrate, ipc, serverSend);
    }

  }
  get loggingEnabled () {
    return _private(this).loggingEnabled;
  }
  set loggingEnabled (val) {
    var context = _private(this),
        serverSend = context.serverSend;

    context.loggingEnabled = !!val;

    if (context.loggingEnabled) {
      Logger.onWrite = function (message) {
        try {
          if (serverSend) serverSend('log', message);
        } catch (err) {
          console.warn('log to client error', err);
        }
      };
    } else {
      Logger.onWrite = undefined;
    }
    return context.loggingEnabled;
  }
  getBoundApp () {
    return _private(this).migrateApp;
  }
  setBoundApp (migrateApp) {
    _private(this).migrateApp = migrateApp;
    return migrateApp;
  }
  getBoundChannel () {
    return _private(this).ipc;
  }
  setBoundChannel (channel) {
    _private(this).ipc = channel;
    return channel;
  }
  getServerSend () {
    return _private(this).serverSend;
  }
  setServerSend (sendFunction) {
    var fn = function () {
      let args = _.map(Array.prototype.slice.apply(arguments), (arg) => {
          if (_.isObject(arg) && arg.toJSON) {
            return arg.toJSON.call(arg);
          } else {
            return arg;
          }
        });
      try {
        args = JSON.stringify(args);
      } catch (err) {
        try {
          args = JSON.stringify(cloneToDepth(args, { maxDepth: 6 }));
        } catch (err) {
          console.error('unable to send message', arguments[0], err);
          throw err;
        }
      } finally {
        return sendFunction('ipc.message', args);
      }
    };
    _private(this).serverSend = fn;
    return fn;
  }
  getContext () {
    return _private(this);
  }
  unbind () {
    var context = _private(this);
    if (context.migrateApp && context.migrateApp.removeEventListener) {
      _.each(context.serverListeners, function (pair) {
        context.migrateApp.removeEventListener(pair[0], pair[1]);
      });
    }
    if (context.ipc && context.ipc.removeEventListener) {
      _.each(context.clientListeners, function (pair) {
        context.ipc.removeEventListener(pair[0], pair[1]);
      });
    }

  }
  init (migrate, ipc, serverSendImpl) {
    var serverSend,
        context = _private(this),
        clientListeners = context.clientListeners,
        serverListeners = context.serverListeners;

    if (migrate) {
      this.setBoundApp(migrate);
    } else {
      migrate = this.getBoundApp();
    }

    if (ipc) {
      this.setBoundChannel(ipc);
    } else {
      ipc = this.getBoundChannel();
    }

    if (serverSendImpl) {
      serverSend = this.setServerSend(serverSendImpl);
    } else {
      serverSend = this.getServerSend();
    }
    /*
    // must bind this to ipc or event.sender
    function sendResponse (eventName, ...args) {
      this.send.apply(this, [eventName + '.response'].concat(args));
    }
    */
    function bindClientEvents(events, prefix) {
      prefix = prefix ? prefix + '.' : '';
      _.each(events, function (handler, key) {
        let eventName = prefix + key;
        if (_.isFunction(handler)) {
          ipc.on(eventName, (event, ...args) => {
            //let cb = sendResponse.bind(event.sender, eventName);
            let cb = _.partial(serverSend, eventName + '.response');
            handler.apply(undefined, [cb].concat(args));
          });
          clientListeners.push([eventName, handler]);
        } else if (_.isObject(handler)) {
          bindClientEvents(handler, eventName);
        }

      });
    }

    function bindServerEvents(events, prefix) {
      prefix = prefix ? prefix + '.' : '';
      _.each(events, function (handler, key) {
        let eventName = prefix + key;
        if (_.isFunction(handler)) {
          migrate.on(eventName, handler);
          serverListeners.push([eventName, handler]);
        } else if (_.isObject(handler)) {
          bindServerEvents(handler, eventName);
        }

      });
    }

    this.bindServerEvents = bindServerEvents;
    this.bindClientEvents = bindClientEvents;

    this.bindServerEvents({
      data: _.partial(serverSend, 'data'),
      progress: _.partial(serverSend, 'progress.' + migrate.taskId),
      'progress.task': function (taskId, stats) {
        serverSend('progress.' + taskId, stats);
      },
      //export: _.partial(serverSend, 'export'),
      //import: _.partial(serverSend, 'import'),
      'progress.all': function (stats) {
        Q.async(function* () {
          for (let taskId in stats) {
            let stats = stats[taskId];
            serverSend('progress.' + taskId, stats);
            let delay = Q.resolve().delay(1);
            yield delay;
          }
          return;
        }).call(ipc);

      },
      'update.task': function (taskId, property, value) {
        serverSend('update.' + taskId, property, value);
      },
      'debugMode': function (isEnabled) {
        serverSend('config.debugMode', isEnabled);
      },
      'data.empty': function () {
        serverSend('data.empty');
      }
    });

    this.bindClientEvents({
      config: {
        update: function (cb, config) {
          // TODO, there's a chance this could cause drama?
          migrate.updateConfig(config)
            .then( () => cb(null, 'updated') )
            .catch( (err) => cb(err) );
        },
        debugMode: function (cb, isEnabled) {
          try {
            if (migrate.debugMode !== isEnabled) {
              migrate.debugMode = isEnabled;
            }
            cb();
          } catch (err) {
            cb(err);
          }
        },
        folder: {
          data: function (cb) {
            console.log('opening folder dialog');
            migrate.openFolderDialog()
              .then(function (folder) {
                migrate.setDataFolder.call(migrate, folder);
                return folder;
              })
              .nodeify(cb);
          },
          content: function (cb) {
            migrate.openFolderDialog()
              .then(function (folder) {

                migrate.updateConfig.call(migrate, { options: { backupFolder: folder }});
                return folder;
              })
              .nodeify(cb);
          }
        }
      },
      repl: function (cb, code, maxDepth = 2) {
        var result = { input: _.trunc(code, 1024) };
        try {
          result.output = vm.runInThisContext(code);
          if (!result.output) result.output = '' + result.output;
        } catch (err) {
          result.error = {
            message: err.message,
            code: err.code,
            stack: err.stack
          };
        }

        let output = cloneToDepth(result, {
          maxDepth: maxDepth + 1,
          maxArrayLength: 100,
          maxStringLength: 512
        });
        cb(null, output);

      },
      sns: {
        test: function (cb, config) {
          migrate.testSnS()
            .then( (total) => { return { total: total }; })
            .nodeify(cb);
        },
        start: function (cb, options) {
          try {
            let task = migrate.export(options);
            cb(null, task.taskId);
          } catch (err) {
            cb(err);
          }
        },
        cancel: function (cb) {
          migrate.cancel()
            .then( () => cb())
            .catch( (err) => cb(err) )
            .done();
        }
      },
      rev: {
        test: function (cb, config) {
          migrate.testRev()
            .then( () => cb() )
            .catch( (err) => cb(err) );
        },
        prepare: function (cb, options) {
          try {
            let task = migrate.createImport(options);
            cb(null, task.taskId);
          } catch (err) {
            cb(err);
          }
        },
        start: function (cb, options) {
          try {
            let task = migrate.import(options);
            cb(null, task.taskId);
          } catch (err) {
            cb(err);
          }
        },
        cancel: function (cb) {
          migrate.cancel()
            .then( () => cb())
            .catch( (err) => cb(err) )
            .done();
        }
      },
      db: {
        content: {
          search: function (cb, query, field = 'title') {
            try {
              let results = migrate.db.search('content', query, field);
              cb(null, results);
            } catch (err) {
              cb(err);
            }
          }
        }
      },
      task: {
        ignore: function (cb, taskId, childTaskId) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) return cb('no task with specified taskId: ' + taskId);

          if (_.isString(childTaskId)) {
            task = _.find(task.tasks, _.matchesProperty('taskId', childTaskId));
            if (!task) return cb('no child task with specified taskId: ' + childTaskId);
          }
          task.ignore = true;
          cb();
        },
        enable: function (cb, taskId, childTaskId) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) return cb('no task with specified taskId: ' + taskId);

          if (_.isString(childTaskId)) {
            task = _.find(task.tasks, _.matchesProperty('taskId', childTaskId));
            if (!task) return cb('no child task with specified taskId: ' + childTaskId);
          }

          task.ignore = false;
          cb();

        },
        cancel: function (cb, taskId, childTaskId) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) return cb('no task with specified taskId: ' + taskId);

          if (_.isString(childTaskId)) {
            task = _.find(task.tasks, _.matchesProperty('taskId', childTaskId));
            if (!task) return cb('no child task with specified taskId: ' + childTaskId);
          }
          task.cancel().nodeify(cb);
        },
        start: function (cb, taskId) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) {
            cb('no task with specified taskId: ' + taskId);
          } else {
            task.one('start', () => cb() );
            task.one('fail', (err = 'Unknown Error') => cb(err) );
            task.start();
          }
        },
        refresh: function (cb, taskId, childDetails = false) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) {
            cb('no task with specified taskId: ' + taskId);
          } else {
            if (task.toJSON) task = task.toJSON();
            let response = _.omit(task, 'content');
            if (response.tasks) {
              response.tasks = _.omit(response.tasks, ['categories', 'content', 'tasks']);
            }
            cb(null, task);
          }
        },
        archive: function (cb, taskId) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) return cb('no task with specified taskId: ' + taskId);

          task.archive();
        },
        delete: function (cb, taskId) {
          var task = migrate.db.get('job', { taskId: taskId });
          if (!task) return cb('no task with specified taskId: ' + taskId);

          // FIXME some of these calls may return errors async
          try {
            if (task.isActive || task.isPending) task.cancel();
            task.archive();
            migrate.db.remove('job', { taskId: taskId });
            cb();
          } catch (err) {
            cb(err);
          }

        }
      }
    });

  }
}

function cloneToDepth (obj, opts = {}, depth = 0) {
    var temp,
        maxArrayLength = opts.maxArrayLength || Infinity,
        maxStringLength = opts.maxStringLength || Infinity,
        maxDepth = opts.maxDepth || 2;

    if(obj == null || (obj !== Object(obj))) {
      return obj;
    }
    if (depth > maxDepth) {
      return obj.toString().slice(0, maxStringLength);
    }

    if (Array.isArray(obj)) {
      // TODO add in maximum length check
      return obj.slice(0, maxArrayLength).map(function (val) {
        return cloneToDepth(val, opts, depth+1);
      });
    }

    temp = {};

    for(var key in obj) {
      if(Object.prototype.hasOwnProperty.call(obj, key)) {
        temp[key] = cloneToDepth(obj[key], opts, depth+1);
      }
    }
    return temp;
}

module.exports = ClientServerBinding;
