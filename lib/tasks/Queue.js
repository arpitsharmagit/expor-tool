'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    Task = require('./Task'),
    UploadTask = require('./UploadTask'),
    ImageTask = require('./ImageTask'),
    SupplementalContentTask = require('./SupplementalContentTask'),
    CommentTask = require('./CommentTask');



class Job extends Task {
  constructor (content) {
    super();

    _.extend(this, {
      vendorId: undefined,
      revId: undefined,
      flags: {
        import: undefined,
        update: undefined,
        discard: undefined
      },
      issues: [
        //fileMissing
        //uploadError
      ],
      // null if no action or undefined, error if problem, object if active/complete
      steps: {
        transcode: undefined,
        upload: undefined,
        image: undefined,
        attachments: undefined,
        comments: undefined,
        categories: undefined,
        permissions: undefined,
        updateAuthorAndDate: undefined
      },
      conflicts: {}
    });

    if (content) {
      this.vendorId = content.vendorId;
      this.videoId = content.videoId;
      this.content = content;
    }
  }
  // TODO impelment progress
  start (rev) {
    super.start();

    var steps = _.at(this.steps, ['upload', 'image', 'attachments', 'comments']);

    let promise = Q.async(function* () {
      var n = steps.length;
      for (let i=0; i<n; i++) {
        let step = steps[i],
            p = step.start(rev);

        p.progress( (stats) => {
          let incrementalProgress = _.isNumber(stats) ? stats : stats.percentage,
              progress = (i + incrementalProgress)/n;
          this.notify(progress);
        });

        yield p;
      }
      /*
      let config = { fileData: 'MUST IMPLEMENT' },
          p = steps.upload.start(rev, config);
      yield p;

      p = steps.image.start(rev, { fileData: 'MUST IMPLEMENT'} );
      yield p;

      if (steps.attachments) {
        p = steps.attachments.start(rev, { fileData: 'MUST IMPLEMENT'} );
        yield p;
      }
      */
    }).call(this);

    return promise
        .then(this.end.bind(this))
        .catch(this.fail.bind(this));
  }

  fromVendor (content) {
    this.vendorId = content.vendorId;
    this.content = content;

    let steps = _(content)
          .pick(['categories','transcode', 'usergroups'])
          .mapValues( (val) => {
            return val.length ? new Task() : undefined;
          }).value();

    steps = {
      transcode: undefined,
      upload: new UploadTask(content),
      image: new ImageTask(content),
      attachments: content.attachments && new SupplementalContentTask(content),
      comments: content.comments && new CommentTask(content),
      categories: undefined,
      permissions: undefined,
      updateAuthorAndDate: undefined
    };

    this.steps = _.merge(this.steps, steps);

    return this;
  }
  syncWithRev (content) {
    throw new Error('implementation incomplete');
    /*
    let video = content.video || content,
        attachments = content.mediaContent,
        usergroups = content.accessControlEntities;

    this.revId = video.videoId || video.id;
    if (this.revId) {
      this.steps.upload.setComplete(this.revId);
    }
    if (video.thumbnailUri) {
      this.thumbnailUri = video.thumbnailUri;
      this.steps.image.setComplete(video.thumbnailUri);
    }
    // TODO update author and date
    if (attachments && attachments.length) {

    }
    */
  }
  static fromVendor (content) {
    var job = new this();
    return job.fromVendor(content);
  }
}

module.exports = Job;
