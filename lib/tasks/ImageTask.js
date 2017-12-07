'use babel';
'use strict';

var UploadTask = require('./UploadTask');

const UPLOAD_TIMEOUT = 60 * 2 * 1000; // 2 min

class ImageTask extends UploadTask {
  constructor (...args) {
    super(...args);
  }
  upload (rev) {
    var content = this.content,
        videoId = content.videoId,
        fileData = this.config.fileData || this.fileData,
        uploadOptions;

    uploadOptions = {
      skipMetadataUpdate: this.config.isBatchUpdate,
      beforeSend: this.queueUpload.bind(this),
      timeout: UPLOAD_TIMEOUT
    };

    return rev.upload.uploadThumbnail(videoId, fileData, uploadOptions)
      .then( (thumbnailUri) => {
        content.thumbnailUri = thumbnailUri;
        return content;
      });
  }
  get fileData () {
    var config = this.config;

    if (config.fileData) {
      return config.fileData;
    } else {
      return this.getAbsolutePath(this.content.vendorThumbnail);
    }
  }
  get videoId () { return this.config.videoId; }
  set videoId (id) { this.config.videoId = id; return id; }
}

module.exports = ImageTask;
