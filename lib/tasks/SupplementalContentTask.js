'use babel';
'use strict';

var UploadTask = require('./UploadTask'),
    _ = require('lodash'),
    Q = require('q');

// TODO exception handling
class SupplementalContentTask extends UploadTask {
  constructor (...args) {
    super(...args);
  }
  upload (rev) {
    var content = this.content,
        attachments = _([content.attachments, content.transcript])
            .flatten()
            .filter(_.identity)
            .value(),
        videoId = content.videoId,
        uploadOptions;

    uploadOptions = {
      skipMetadataUpdate: this.config.isBatchUpdate,
      beforeSend: this.queueUpload.bind(this)
    };

    if (!videoId) {
      throw new Error('videoId not defined');
    }

    if (!attachments || !attachments.length) {
      throw new Error('no attachments');
    }

    return Q.async(function* () {
      var progressIndex = 0, progressTotal = _.size(attachments);

      let progressCallback = (fileData, stats) => {
        let incrementalProgress = _.inRange(stats.percentage || stats.progress, 0, 1) || 0,
            progress = (progressIndex + incrementalProgress) / progressTotal;
        this.notify({ progress: progress, current: fileData });
      };

      for (let attachment of attachments) {
        let fileData = this.getfileDataForAttachment(attachment),
            p = rev.upload.uploadSupplementalContent(videoId, fileData, uploadOptions);
            // perhaps you need to update video metadata
            //p = rev.upload.uploadSupplementalContent(videoId, fileData, true);

        p.progress(progressCallback.bind(this, fileData));

        let mediaContent = yield p;
        attachment.metadataContentId = mediaContent.id;
        attachment.title = mediaContent.title;

        progressIndex += 1;
      }
      /*
      if (!skipMetadataUpdate) {
        let p = rev.media.getVideo(videoId),
            {video: videoDetails} = yield p;

        // toRevData should return {id, title} which was set above
        let mediaContents = _.map(attachments, (attachment) => attachment.toRevData());

        videoDetails.videoId = videoId;
        videoDetails.mediaContent = mediaContents;

        p = rev.media.modifyVideo(videoDetails);
        yield p;
      }
      */
      return yield;

    }).call(this);


  }
  getfileDataForAttachment (attachment) {
    return this.getAbsolutePath(attachment.relativeFilePath);
  }
}

module.exports = SupplementalContentTask;
