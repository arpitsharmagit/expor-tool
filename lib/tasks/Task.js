'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    EventEmitter = require('events').EventEmitter;

_.mixin(require('../util/lodashMixins'));

function randId () {
  return Math.random().toString(16).replace('0.', '_');
}

class Task extends EventEmitter {
  constructor (taskLabel = 'task', data = {}) {
    super();

    if (_.isObject(taskLabel)) {
      data = taskLabel;
      taskLabel = data.label || '';
    }

    // add any specified data
    _.assign(this, {
        statistics: { progress: 0 },
        type: this.constructor.name,
        issues: []
      }, data);

    this.taskId = taskLabel + randId();
    this.created = new Date();

    let _ignore = false, _status = Task.PENDING;
    Object.defineProperties(this, {
      ignore: {
        get: () => _ignore,
        set: (newValue) => {
          _ignore = !!newValue;
          this.emit('update', 'ignore', _ignore);
          return _ignore;
        }
      },
      status: {
        get: () => _status,
        set: (newValue) => {
          _status = newValue;
          this.emit('update', 'status', _status);
          return _status;
        }
      }
    });

    this.defer = Q.defer();

    setImmediate(this.emit.bind(this, 'status', this.status));

  }
  start () {
    this.status = Task.ACTIVE;

    this.statistics.progress = 0;
    this.statistics.start = new Date();

    this.emit('start');
    this.emit('status', this.status);
    return this.promise;
  }
  reset () {
    let newDefer = Q.defer();
    this.defer.resolve(newDefer);
    this.defer = newDefer;

    this.status = Task.PENDING;
    this.statistics = { progress: 0 };
    this.emit('reset');
    this.emit('status', this.status);

  }
  end (value) {
    this.status = Task.DONE;

    this.statistics.end = new Date();
    this.statistics.progress = 1;

    this.defer.resolve(value);
    this.emit('end', value);
    this.emit('status', this.status, value);
    return value;
  }
  setComplete (value) {
    return this.end.apply(this, arguments);
  }
  fail (reason) {
    if (this.status !== Task.CANCELLED) this.status = Task.FAIL;

    this.statistics.end = new Date();
    this.statistics.progress = 1;

    this.issues.push(reason);
    this.defer.reject(reason);
    this.emit('fail', reason);
    this.emit('status', this.status, reason);
    return Q.reject(reason);
  }
  cancel () {
    this.status = Task.CANCELLED;
    return this.fail('cancelled');
  }
  // used to indicate that jobs shouldn't be processed
  archive () {
    this.statistics.archivedStatus = this.status;
    this.status = Task.ARCHIVED;
    return Q.resolve('archived');
  }
  notify (stats) {
    var progress;

    if (!this.isActive) return;

    if (_.isObject(stats)) {
      _.extend(this.statistics, stats);
      progress = _.isNumber(stats.progress) ? stats.progress : stats.percentage;
    } else {
      progress = stats;
    }
    // will only update if a valid number
    this.progress = progress;

    this.defer.notify(this.statistics);
    setImmediate( () => this.emit('progress', this.statistics) );

  }
  addIssue (error, data, domain = this.taskId) {
    var msg;
    if (_.isObject(error) && !data) {
      msg = error;
    } else {
      msg = { domain: domain, error: error, data: data };
    }
    this.issues.push(msg);
    setImmediate( () => this.emit('issue', msg) );
  }

  get progress () {
    return this.isPending ? 0 :
        this.isActive ? this.statistics.progress :
        1;
  }
  set progress (value) {
    if (_.inRange(value, 0, 1)) this.statistics.progress = value;
    return value;
  }

  get promise () { return this.defer.promise; }

  get isPending () { return this.status === Task.PENDING && !this.ignore; }
  get isActive () { return this.status === Task.ACTIVE; }
  get isDone () { return this.status === Task.DONE; }
  get isFailed () { return this.status === Task.FAIL || this.status === Task.CANCELLED; }
  toJSON () {
    var result = _.omit(this, ['domain', '_events', '_eventsCount', '_maxListeners', 'defer', 'options', 'content']);
    if (this.content) {
      result.vendorId = this.content.vendorId;
      result.videoId = this.content.videoId;
      result.content = _.pick(this.content, ['vendorId', 'videoId', 'title', 'whenUploaded', 'author']);
    }

    result.status = this.status;
    result.ignore = this.ignore;

    return result;
  }
  emit () {
    if (arguments[0] !== '*') {
      this.emit.apply(this, ['*'].concat( _.toArray(arguments) ));
    }
    return super.emit.apply(this, arguments);
  }
  static get PENDING () { return 'waiting'; }
  static get CANCELLED () { return 'cancelled'; }
  static get ACTIVE () { return 'active'; }
  static get DONE () { return 'complete'; }
  static get FAIL () { return 'failed'; }
  static get IGNORE () { return 'ignore'; }
  static get ARCHIVED () { return 'archived'; }
}


module.exports = Task;
