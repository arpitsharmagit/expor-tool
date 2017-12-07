'use babel';
'use strict';

var Q = require('q'),
//var
    _ = require('lodash'),
    Job = require('../jobs/Job'),
    Logger = require('../util/Logger'),
    DataStore = require('../DataStore'),
    ShowAndShare = require('../cisco'),
    RevConnection = require('../rev'),
    VendorExportJob = require('./VendorExportJob'),
    RevImportJob = require('./RevImportJob'),
    store = require('../util/global-store');

_.mixin(require('../util/lodashMixins'));

var log = new Logger('main');

var DEBUG_LOG_MAP = {
  '*': log.debug.bind(log),
  'info': log.info.bind(log),
  'warn': log.warn.bind(log),
  'issue': log.error.bind(log),
  'log': log.debug.bind(log)
};


let DEFAULT_CONFIG = {

  debugMode: false,
  logLevel: 'info',
  options: {
    backupFolder: undefined,
    preferredWidth: undefined,
    pageSize: 50,
    continueOnError: true,
    autosave: true,
    batchSize: 100,
    ignoreFlags: {
      categories: false,
      video: false,
      image: false,
      attachments: false,
      comments: true,
      author: false,
      transcode: true,
      permissions: true
    },
    "defaultAuthor": null
  },
  rev: {
    url: undefined,
    username: undefined,
    password: undefined,
    proxy: undefined,
    userAgent: undefined,
    uploadTimeoutInSeconds: 60 * 60 * 1, // one hour
    routeTimeoutInSeconds: 60 * 5 // 5 min
  },
  sns: {
    username: undefined,
    password: undefined,
    url: undefined,
    proxy: undefined,
    pageSize: 50,
    pageStartOffset: 0,
    maxResults: 100000,
    sortDescending: false
    // maxPages: 2048
    // timeout: 60 * 5 * 1000
  },
  db: {
    folder: undefined,
    contentFilename: 'migrate-content.json',
    categoryFilename: 'migrate-category.json',
    teamsFilename: 'migrate-teams.json',
    usersFilename: 'migrate-users.json',
    jobsFilename: 'migrate-jobs.json',
    autosave: false,
    async: true
  }
};

const DELAY_BETWEEN_LOAD_EMITS = 10; // milliseconds between events when loading
const MAX_RETURN_COUNT = 5000;

class Migrate extends Job {
  constructor (config = {}) {
    super('migrate');
    this.emit = this.emit.bind(this);

    this.config = config = _.merge({}, DEFAULT_CONFIG, config);

    store.set('config', config);

    this.init();

    this.store = store;

  }
  init () {
    var config = this.config;

    this.debugMode = config.debugMode;

    if (!this.rev && config.rev && config.rev.url) {
      this.rev = new RevConnection(config.rev);
      store.set('rev', this.rev);
    }

    if (!this.sns && config.sns && config.sns.url) {
      this.sns = new ShowAndShare(config.sns);
      store.set('sns', this.sns);
    }

    if (!this.db && config.db && config.db.folder) {
      this.db = new DataStore(config.db);
      this.emitData(config.db.folder);
      store.set('db', this.db);
      store.set('content', this.db.content);
    }

    if (this.rev && this.sns && this.db) {
      this.emit('ready');
    }

  }
  updateConfig (config = {}) {

    // TODO is there case where config and this.config could get out of alignment / cause issues?

    config = _.merge(this.config, config);

    this.init();

    if (shouldUpdateConfig(this.sns, config.sns)) {
      this.sns.init(config.sns);
    }
    if (shouldUpdateConfig(this.rev, config.rev)) {
      this.rev.init(config.rev);
    }
    if (shouldUpdateConfig(this.db, config.db)) {
      this.db.init(config.db);
      this.emitData();
    }

    this.emit('config', this.config);
    return Q.resolve(this.config);
  }
  setDataFolder (folder) {
    this.config.db.folder = folder;

    if (this.db) {
      this.db.init({ folder: folder });
    } else {
      this.init();
    }
    this.emit('data.empty');
    this.emitData();

    return Q.resolve(this.config);
  }
  emitData () {
    return Q.async(function* () {
      var types = ['category', 'content', 'team', 'user'];

      // archive old jobs
      _.each(this.db.job, (job) => {
        job.archived = true;
      });
      for (let type of types) {
        let bucket = this.db[type],
            limit = Math.min(bucket.length, MAX_RETURN_COUNT),
            i = 0;


        for (let item of bucket) {
          if (++i > limit) {
            log.warn('TOO MANY ITEMS TO EMIT/DISPLAY', type, bucket.length, limit);
            break;
          }

          this.emit('data', type, item);
          yield Q.resolve().delay(DELAY_BETWEEN_LOAD_EMITS);
        }

      }

    }).call(this);
  }
  testSnS () {

    return Q.async(function* () {
      try {
        let connectionTest = this.sns.testConnection();
        yield connectionTest;
      } catch (err) {
        let msg = { domain: 'config', data: 'connection failed', error: err, label: 'connection failed' };
        log.error(msg);
        this.emit('warn', msg);
        return yield Q.reject(msg);
      }

      let p = this.sns.getTotalContentCount(),
          totalCount = yield p;
      this.sns.totalCount = totalCount;
      log.info('total videos in system: ' + totalCount);
      this.emit('progress', { progress: 0, total: totalCount });
      this.importTotalcount = totalCount;
      return yield totalCount;

    }).call(this);
  }
  testRev (options) {
    var p = this.rev.isConnected ?
          this.rev.user.getUserDetail(this.rev.userId) :
          this.rev.connect();

    return p
      .then( () => {

        return 'connected';
      })
      .catch( (err) => {
        let msg = { domain: 'config', data: 'connection failed', error: err, label: 'connection failed' };
        log.error(msg);
        this.emit('warn', msg);
        return Q.reject(msg);
      });
  }
  export (options = {}) {
    var config = _.extend(this.sns.config, _.pick(options, ['pageStartOffset', 'pageSize', 'maxResults'])),
        indexStart = config.pageStartOffset * config.pageSize,
        indexEnd = Math.min(this.importTotalcount || Infinity, indexStart + config.maxResults),
        task;

    task = new VendorExportJob(this, `vendorexport${indexStart}-${indexEnd}`);

    this.attachChildTask(task, 'export');
    this.insertTask(task);

    task.start()
      .then( () => {
        log.info(`Vendor Export ${indexStart}-${indexEnd} Complete`);
      })
      .finally( () => {
        this.db.save('job');
      });

    return task;
  }
  createImport (options = {}) {
    var task;

    if (this.tasks.import) {
      log.warn('prepare import called when import job already exists');
      let importTask = this.tasks.import;
      if (importTask.isPending || importTask.isActive) {
        return Q.reject('Already importing.  Cancel existing import first.');
      }

      importTask.archive();

    }

    _.extend(this.config.options, _.pick(options, ['batchSize', 'preferredWidth']));

    task = new RevImportJob(this, `revimport${this.config.options.batchSize}`);



    this.attachChildTask(task, 'import');
    this.insertTask(task);

    let categoryFilter = !_.isUndefined(options.categoryFilter) ?
                          options.categoryFilter :
                          this.config.options.categoryFilter;
    let contentFilter = !_.isUndefined(options.contentFilter) ?
                          options.contentFilter :
                          this.config.options.contentFilter;

    task.prepare(contentFilter, categoryFilter);

    return task;
  }
  import () {
    var task = this.tasks.import;

    task.start()
      .then( () => {
        log.info(`Vendor Export ${task.taskId} Complete`);
      })
      .finally( () => {
        this.db.save('job');
      });

    return task;
  }
  attachChildTask (task, label) {
    super.attachChildTask.apply(this, arguments);

    task.on('data', (type, data) => {
      if (type === 'task') this.insertTask(data);
    });

    task.on('progress', (stats) => {
      this.emit('progress.' + task.taskId, stats);
    });
    task.on('progress.task', (taskId, stats) => this.emit.call(this, 'progress.' + task.taskId, stats));

  }
  insertTask (task) {
    task.on('debug', log.debug.bind(log, task.taskId));
    task.on('info', log.info.bind(log, task.taskId));
    task.on('warn', log.warn.bind(log, task.taskId));
    task.on('issue', log.error.bind(log, task.taskId));
    this.db.upsert('job', task);
  }
  sendAllProgress () {
    let allProgress = _.reduce(this.db.job, (result, job, index) => {
      result[job.taskId] = _.pick(job, ['type', 'status', 'statistics', 'taskId']);
      return result;
    }, {});
    allProgress.main = _.pick(this, ['type', 'status', 'statistics', 'taskId']);
    this.emit('progress.all', allProgress);
    return allProgress;
  }
  get config () {
    return store.get('config');
  }
  set config (val = {}) {
    if (!_.isObject(val)) {
      throw new Error('error, tried to set config to non-object', val);
    }
    return store.set('config', val);
  }
  get allActiveTasks () {
    return this.db.select('job', _.property('isActive'));
  }
  get verbosity () {
    return Logger.LOG_LEVEL;
  }
  set verbosity (level) {
    this.setVerbosity(level);
  }
  setVerbosity (level, logName) {
    if (_.isString(level)) {
      level = Logger[level.toUpperCase()];
    }
    return Logger.verbosity(level, logName);
  }
  get debugMode () {
    return this.config && this.config.debugMode;
  }
  set debugMode (isEnabled) {
    isEnabled = !!isEnabled;

    let oldMode = this.config.debugMode;

    this.config.debugMode = !!isEnabled;

    if (isEnabled) {
      this.verbosity = Logger.ALL;
    } else {
      this.verbosity = this.config.logLevel || Logger.INFO;
    }

    if (oldMode !== isEnabled) {
      setImmediate(this.emit.bind(this, 'debugMode', isEnabled));
    }

    return isEnabled;
  }
  emit (eventName, ...args) {
    if (this.debugMode && DEBUG_LOG_MAP[eventName]) {
      DEBUG_LOG_MAP[eventName].apply(log, args);
    }
    return super.emit.apply(this, arguments);
  }
  openFolderDialog() {
    console.warn('NOT IMPLEMENTED OPEN FOLDER DIALOG');
    return Q.reject();
  }
  showExportFolder() {
    console.warn('NOT IMPLEMENTED SHOW EXPORT FOLDER');
    return Q.reject();
  }

}

// checks if any of the values in obj2 are missing or different from obj1
function shouldUpdateConfig(objWithConfig = {}, newConfig = null) {
  return objWithConfig.config &&
        newConfig &&
        !_.isMatch(objWithConfig.config, newConfig);
}

module.exports = Migrate;
