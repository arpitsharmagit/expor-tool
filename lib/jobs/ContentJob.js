'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    Logger = require('../util/Logger'),
    Job = require('./Job'),
    UploadTask = require('../tasks/UploadTask'),
    ImageTask = require('../tasks/ImageTask'),
    SupplementalContentTask = require('../tasks/SupplementalContentTask'),
    CommentTask = require('../tasks/CommentTask'),
    AuthorAndDateTask = require('../tasks/AuthorAndDateTask');

var log = new Logger('content');


// single argument can be content, or the JSON data of previous attempt for resuming
class ContentJob extends Job {
  constructor (data = {}) {
    let content = data.content,
        label = 'vid-' + _.trunc(content.title, {length: 16, omission: ''});

    data.label = data.label || label;
    super(data);

    this.options = _.merge({}, ContentJob.defaultOptions, data.config, data.options);

      // null if no action or undefined, error if problem, object if active/complete
      // can use jobData to exclude these, perhaps

    // TODO this won't upload new/updated attachments/comments
    let ignoreFlags = this.options.ignoreFlags,
        importOptions = this.options;

    var addTaskRules = {
      upload: {
        ignore: ignoreFlags.video,
        inRev: !!content.videoId,
        TaskClass: UploadTask
      },
      image: {
        ignoreFlag: ignoreFlags.image,
        inRev: !!content.thumbnailUri,
        TaskClass: ImageTask
      },
      attachments: {
        ignoreFlag: ignoreFlags.attachments,
        inRev: (content.transcript || content.attachments) && !_.isEmpty(content.mediaContent),
        TaskClass: SupplementalContentTask
      },
      comments: {
        ignoreFlag: ignoreFlags.comments,
        inRev: _.isEmpty(content.comments) || !_.any(content.comments, 'commentId'),
        TaskClass: CommentTask
      },
      authorAndDate: {
        ignoreFlag: ignoreFlags.author,
        inRev: false,
        TaskClass: AuthorAndDateTask
      },
      transcode: {
        ignoreFlag: ignoreFlags.transcode,
        inRev: false,
        TaskClass: undefined
      },
      permissions: {
        ignoreFlag: ignoreFlags.permissions,
        inRev: false,
        TaskClass: undefined
      }
    };

    _.each(addTaskRules, (rule, taskLabel) => {
      if (!rule.ignoreFlag && !rule.inRev && rule.TaskClass) {
        try {
            let data = {
                  content: content,
                  label: taskLabel,
                  config: importOptions
                },
                task = new rule.TaskClass(data);
            this.attachChildTask.call(this, task, taskLabel);
            /*
            if (options.ignoreFlags[taskLabel]) {
              task.ignore = true;
            }
            */
        } catch (err) {
          log.error('Failed to add task', err, taskLabel);
          throw err;
        }
      }
    });

  }
  start (migrate) {
    super.start();

    var { rev, config } = migrate,
        uploadOptions = _.pick(config.options, ['backupFolder', 'preferredWidth', 'uploadTimeoutInSeconds', 'defaultUserName']);

    let promise = Q.async(function* () {
      var content = this.content,
          tasks = this.tasks;

      log.debug(this.taskId + ': starting import of ' + content.title);

      // do video upload
      if (tasks.upload && tasks.upload.isPending) {
        try {
          // set preferredWidth to have specific size.  otherwise highest quality
          // right now this will save metadata after complete
          this.statistics.current = 'uploading video';
          let taskPromise = tasks.upload.start(rev, uploadOptions);
          log.debug('Starting Video Upload');
          yield taskPromise;

        } catch (err) {
          // don't continue on video upload failure
          log.error('video upload fail!', this, err);
          return yield Q.reject(err);
        }

        log.debug(this.taskId + ': video upload complete', content.title);
      }

      for (let taskName in tasks) {
        let task = tasks[taskName];

        if (!task.isPending) {
          log.debug(this.taskId + ': skipping task', taskName);
          continue;
        }

        this.statistics.current = taskName;

        try {
          let taskPromise = task.start(rev, uploadOptions);
          yield taskPromise;

        } catch (err) {
          log.error(`${this.taskId}: ${taskName} update fail!`, this, err);
          log.warn(`continuing content job even though ${taskName} update failed`);
        }
      }

      log.debug(this.taskId + ': all tasks complete', content.title);
      return yield content;

    }).call(this);

    return promise.then(this.end.bind(this)).catch(this.fail.bind(this));
  }
  get ignoreFlags () { return this.options.ignoreFlags; }
  set ignoreFlags (flags = {}) {

    _.extend(this.options.ignoreFlags, flags, (currFlag, newFlag, taskName) => {
      if (this.tasks[taskName]) {
        this.tasks[taskName].ignore = !!newFlag;
      }
      return !!newFlag;
    });

    return this.options.ignoreFlags;
  }
  static get defaultIgnoreFlags () {
    return {
      ignoreFlags: {
        categories: true,
        video: true,
        image: true,
        attachments: true,
        comments: true,
        author: true,
        transcode: true,
        permissions: true
      }
    };
  }
}

module.exports = ContentJob;
