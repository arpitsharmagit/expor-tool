'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    Task = require('./Task');

_.mixin(require('../util/lodashMixins'));

class CommentTask extends Task {
  constructor (...args) {
    super(...args);
  }
  start (rev) {
    super.start();

    if (!this.content) {
      throw new Error('Comments Task not bound to content');
    }

    var content = this.content,
        videoId = content.videoId,
        comments = _(content.comments)
            .bubble().filter(_.isObject).value();

    if (!videoId) {
      throw new Error('videoId not defined');
    }

    if (!comments || !comments.length) {
      throw new Error('no comments');
    }

    function formatComment (comment) {
      let when = (new Date(comment.when)).toDateString(),
          timeline = (comment.time) ? `[${comment.time})] ` : '';
      return `${timeline}On ${when} ${comment.username} wrote:\n${comment.text}`;
    }

    // TODO: add in exception handling
    let promise = Q.async(function* () {
      var progressIndex = 1, progressTotal = comments.length;

      let {basicComments, timelineComments} = _.groupBy(comments, (comment) => {
            return comment && comment.isTimelineComment ? 'timelineComments' : 'basicComments';
          });


      if (timelineComments) {
        let data = { videoId: videoId, text: 'Timeline Comments' },
            p = rev.media.addRootVideoComment(data),
            rootTimelineCommentId = yield p;

        this.rootTimelineCommentId = rootTimelineCommentId;

        for (let comment of timelineComments) {
          data = {
            videoId: videoId,
            parentCommentId: rootTimelineCommentId,
            text: formatComment(comment)
          };
          p = rev.media.addChildVideoComment(data);
          let commentId = yield p;

          comment.commentId = commentId;

          this.notify((++progressIndex) / progressTotal);
        }
      }

      if (basicComments) {
        for (let comment of comments) {
          let data = { videoId: videoId, text: formatComment(comment) },
              p = rev.media.addRootVideoComment(data),
              commentId = yield p;

          comment.commentId = commentId;
        }
      }

      return yield this.content;
    }).call(this);

    return promise
        .then(this.end.bind(this))
        .catch(this.fail.bind(this));

  }
}

module.exports = CommentTask;
