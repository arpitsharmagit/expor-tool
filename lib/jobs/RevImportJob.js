'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    _private = require('../util/private-store').create(),
    Logger = require('../util/Logger'),
    Job = require('./Job'),
    //fs = require('fs'),
    CategoryJob = require('../jobs/CategoryJob'),
    ContentJob = require('../jobs/ContentJob'),
    store = require('../util/global-store');

_.mixin(require('../util/lodashMixins'));

var log = new Logger('import-rev');


class RevImportJob extends Job {
  constructor (migrate, taskLabel) {
    super(taskLabel);

    //var {rev, db} = migrate;

    _private(this, {
      migrate: migrate,
      rev: migrate.rev,
      db: migrate.db,
      cancelRequestedFlag: false,
      // TODO should this be cloned?  the ignore flags bit could be globally updated
      importOptions: store.get('config.options')
    });


  }
  prepare (contents, categories) {

    log.debug('preparing category import');
    this.prepareCategoryImport(categories);
    log.debug('preparing video import', contents);
    this.prepareVideoImport(contents);

    _private(this).prepared = true;
    return this.tasks;

  }
  pause (promise) {
    var context = _private(this),
        deferred = Q.defer();

    log.warn('pausing import process');

    if (context.pauseDeferred) {
      context.pauseDeferred.resolve(deferred.promise);
    }

    context.pauseDeferred = deferred;
    context.pausePromise = deferred.promise;

    if (Q.isPromiseAlike(promise)) {
      deferred.resolve(promise);
    }
    return deferred;
  }
  resume () {
    var context = _private(this);
    log.info('unpausing import process');
    context.pauseDeferred.resolve();
    delete context.pauseDeferred;
    delete context.pausePromise;

    return true;
  }
  start () {
    super.start();
    var context = _private(this),
        { rev, migrate, db } = context,
        importOptions = store.get('config.options'),
        continueOnError = importOptions.continueOnError,
        skipCategoryImport = importOptions.ignoreFlags.categories;

    context.cancelRequestedFlag = false;

    if (!context.prepared) {
      return Q.reject('No import tasks prepared');
    }

    let promise = Q.async(function* () {

      if (!rev.isConnected) {
        try {
          let p = rev.connect();
          yield p;
        } catch (err) {
          return yield Q.reject(err);
        }
      }

      try {
        log.debug('validating default author');
        let taskPromise = this.validateDefaultAuthor();
        yield taskPromise;
      } catch (err) {
        log.warn('error on validating default author', err);
        this.addIssue(err);
        if (!continueOnError) return Q.reject(err);
      }

      if (!skipCategoryImport) {
        try {
          log.debug('starting categories import task');
          let taskPromise = this.importCategories();
          yield taskPromise;
          log.debug('category import complete');
        } catch (err) {
          log.warn('error on category task', err);
          this.addIssue(err);
          if (!continueOnError) return Q.reject(err);
        }
      } else {
        log.warn('skipping category import process');
      }

      // TODO: this doesn't allow parallel execution
      // could easily (?) change that by grouping into chunks
      log.debug('starting video import process');
      for (let taskId in this.tasks) {
        let task = this.tasks[taskId];

        if (context.cancelRequestedFlag) {
          return yield Q.reject('cancelled');
        }

        if (context.pausePromise && context.pausePromise.isPending) {
          log.info('pausing import process');
          this.emit('paused');
          this.emit('info', 'paused');
          let oldCurrent = this.statistics.current;
          this.statistics.current = 'paused';
          this.statistics.activity = 'paused';
          this.notify(this.statistics);
          yield context.pausePromise;
          this.statistics.current = oldCurrent;
          this.statistics.activity = 'resumed';
          this.notify(this.statistics);
          this.emit('resume');
          this.emit('info', 'resume');
        }

        if (task.isPending) {
          // TODO there's got to be a better place to put this
          if (task.content && task.content.categories) {
            this.updateContentCategories(task.content);
          }

          log.debug('starting task', task);
          try {
            this.statistics.current = task.taskId;
            this.statistics.video = task.content && task.content.title;

            let content = yield task.start(migrate);

            this.emit('content', content);

          } catch (err) {
            log.warn('error on content task', err);
            this.addIssue(err, task.taskId);
            if (!continueOnError) return Q.reject(err);
          }
        } else {
          log.debug('skipping import task', task.taskId, task.status);
        }
      }

      log.info('import batch complete');
      try {
        log.debug('saving to disk');
        let p = db.save('content');
        yield p;
        p = db.save('job');
        yield p;
      } catch (err) {
        log.warn('error on database save', err);
        this.addIssue(err);
      }
      return yield this.end('complete');
    }).call(this);

    return promise;

  }
  prepareCategoryImport (categories) {
    let {db, importOptions} = _private(this);

    if (_.isEmpty(categories)) {
      let selectFilter = categories || _.identity;
      categories = db.select('category', selectFilter);
    }

    let task = new CategoryJob(categories);

    this.attachChildTask(task, 'categoryImport');
    if (importOptions.ignoreFlags.categories) {
      task.ignore = true;
    }

    return task;
  }
  importCategories () {
    let context = _private(this),
        { migrate, db } = context,
        importOptions = store.get('config.options'),
        task = this.tasks.categoryImport;

    task.start(migrate)
      .then( () => {
        if (importOptions.autosave) {
          log.debug('saving categories');
          db.save('category');
        }
        this.emit('categories', task.categories);

      })
      .catch( (err) => {
        log.warn('error adding categories', err, this);
        this.addIssue(err, 'at adding categories', 'category');
        if (!importOptions.continueOnError) {
          // set cancel flag to keep content form importing
          log.debug('setting cancel flag to avoid content import');
          context.cancelRequestedFlag = true;
        }
      });

    return task.promise;

  }
    // contents can be array of videos, or a filter function
  prepareVideoImport (contents) {
    let { db, migrate } = _private(this),
        importOptions = migrate.config.options;

    if (_.isEmpty(contents)) {

      let selectFilter = contents || _.identity;
      contents = db.select('content', selectFilter);

      if (contents.length > importOptions.batchSize) {

        contents = _(contents)
            .filter( (c) => !c.videoId )
            .take( importOptions.batchSize).value();
      }
    }

    // TODO: MUST CHECK IF BACKUP FOLDER IS SET IN CONFIG!
    _.each(contents, (content) => {
      try {
        // update content categories with proper ids
        if (content.categories) {
          this.updateContentCategories(content);
        }

        let taskData = { content: content, options: importOptions },
            contentTask = new ContentJob(taskData);

        this.attachChildTask(contentTask);
      } catch (err) {
        log.error('PREPARE FAIL!', err, content);
      }
    });

  }
  /*attachChildTask(task, label) {
    super.attachChildTask(task, label);
    return task;
  }*/
  updateContentCategories (content) {
    let { db } = _private(this);

    _.each(_.bubble(content.categories), (contentCategory) => {
      if (contentCategory.categoryId) return;

      let category = db.get('category', contentCategory.path, 'path');
      if (category) {
        contentCategory.categoryId = category.categoryId;
      }
    });
  }
  validateDefaultAuthor () {
    let { rev } = _private(this),
        authorKey = 'config.options.defaultAuthor',
        currentUsernameKey = 'config.rev.username',
        defaultAuthor = store.get(authorKey, store.get(currentUsernameKey)),
        p;

    if (!defaultAuthor) {
      p = Q.reject(new Error('No Default Author Defined'));
    }

    if (/@/.test(defaultAuthor)) {
      p = rev.user.getUserByEmail(defaultAuthor)
        .then( (user) => {
          if (!user) {
            return Q.reject(new Error(`Rev user with email ${defaultAuthor} not found`));
          }

          return user.username;
        });
    } else {
      p = rev.user.getUserByUsername(defaultAuthor)
        .then( (user) => {
          if (!user) {
            return Q.reject(new Error(`Rev user with username ${defaultAuthor} not found`));
          }
          if (user.username !== defaultAuthor) {
            return Q.reject(new Error(`Default Author username mismatch: expected ${defaultAuthor} but Rev returned ${user.username}`));
          }

          return user.username;
        });
    }

    return p.then( (username) => {
        log.info('setting default username', username, 'was', defaultAuthor);
        store.set(authorKey, username);
        return username;
      })
      .catch( (err) => {
        log.warn('Error with default author', err);
        log.debug('setting to current user');
        let username = rev.context.user.username || store.get('config.rev.username');
        store.set(authorKey, username);
        return username;
      });

  }
  handleChildComplete (task) {
    var { db, importOptions } = _private(this),
        { pageSize, autosave } = importOptions;

    // make sure changes are propagated to datastore
    if (task.content) {
      db.update('content', _.pick(task.content, 'vendorId'), task.content);
    }

    super.handleChildComplete(task);

    if (autosave && (this.statistics.index % pageSize === 0)) {
      log.debug('saving to db at page', this.statistics, pageSize);
      db.save('content');
    }

  }
  get activeTasks () {
    return _.filter(this.tasks, 'isActive');
  }
  // allow changes at this level to override all childrens' settings
  get ignoreFlags () { return _private(this).importOptions.ignoreFlags; }
  set ignoreFlags (flags = {}) {
    var ignoreFlags = this.ignoreFlags;
    _.extend(ignoreFlags, flags, (value, other) => !!other);

    _.each(this.tasks, (task) => {
      if (task instanceof ContentJob) {
        task.ignoreFlags = ignoreFlags;
      }
    });

    return flags;
  }

}
module.exports = RevImportJob;

/*
*/
