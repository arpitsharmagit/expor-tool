'use babel';
'use strict';

var _ = require('lodash'),
    Task = require('../tasks/Task');

const PROGRESS_UPDATE_INTERVAL = 1000;

class Job extends Task {
  constructor (...args) {
    super(...args);

    this.tasks = {};
    this.statistics.total = 0;
    this.statistics.index = 0;

    this.aggregateProgress = _.throttle( ( stats ) => {
      if (_.isEmpty(this.tasks)) this.notify(stats);

      var childProgress = _.pluck(this.tasks, 'progress');
      this.notify(_.sum(childProgress) / childProgress.length);
    }, PROGRESS_UPDATE_INTERVAL);

  }
  cancel () {
    super.cancel();
    _.invoke(this.activeTasks, 'cancel');
    return this.promise;
  }
  reset () {
    super.reset();
    this.statistics.index = 0;
    this.statistics.total = 0;
    _.invoke(this.tasks, 'reset');
    _.each(this.tasks, (task, label) => {
      this.attachChildTask(task, label, false);
    });
  }
  attachChildTask (task, label, listenForWarnings = true) {
    task.parentId = this.taskId;
    this.tasks[(label || task.taskId)] = task;

    this.statistics.total += 1;

    if (listenForWarnings) {
      task.on('warn', (msg) => {
        this.issues.push(_.extend({ source: task.taskId, time: new Date() }, msg));
      });
    }

    // allow event propagation to notify of state/ignore changes
    // FIXME this is a pretty lousey for propagation, maybe a global message bus would be better
    task.on('update', (property, value) => {
      this.emit('update.task', task.taskId, property, value);
    });
    task.on('update.task', this.emit.bind(this, 'update.task'));

    // pass through data events directory
    task.on('data', this.emit.bind(this, 'data'));

    task.on('progress', this.emit.bind(this, 'progress.task', task.taskId));
    task.on('progress.task', this.emit.bind(this, 'progress.task'));

    task.promise.progress(this.aggregateProgress);
    task.promise.finally(this.handleChildComplete.bind(this, task));

    this.emit('data', 'task', task);
    return task;

  }
  handleChildComplete (task) {
    this.statistics.index += 1;
    this.aggregateProgress();


  }
  get activeTasks () {
    return _.filter(this.tasks, 'isActive');
  }
  toJSON () {
    var result = super.toJSON.call(this);
    result.tasks = _.transform(this.tasks, (out, value, key) => {
      out[key] = value.toJSON.call(value);
    });
    return result;
  }
  archive () {
    _.invoke(this.tasks, 'archive');
    super.archive.call(this);
  }
}

module.exports = Job;
