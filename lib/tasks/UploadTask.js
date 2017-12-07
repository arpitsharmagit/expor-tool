'use babel';
'use strict';

var Task = require('./Task'),
    path = require('path'),
    _ = require('lodash');

/* config can be
 {
    folder: folder used to resolve content relative paths.
    fileData: absolute path to file, or readable stream,
    isBatchUpdate: if true then upload process won't update video metadata,
    preferredWidth: if specified then instance uploaded will be the one closest to given dimensions.  Otherwise it uploads the highest bitrate instance found.
 }
  folder or fileData MUST be specified.
*/
class UploadTask extends Task {
  constructor (data = {}) {
    super(data);

    if (!data.content) {
      throw new Error('Content must be specified for upload task');
    }
    if (!data.config) {
      throw new Error('Config must be specified for upload task');
    }

    this.queue = new Set();
    this.promise.finally( () => {
      this.queue.clear();
    });

  }
  upload (rev) {
    var content = this.content,
        metadata = content.toRevData(),
        fileData = this.config.fileData || this.fileData,
        uploadOptions;

    uploadOptions = {
      skipMetadataUpdate: this.config.isBatchUpdate,
      beforeSend: this.queueUpload.bind(this)
    };

    let uploadPromise = rev.upload.uploadVideo(fileData, metadata, uploadOptions);

    return uploadPromise.then( (videoId) => {
      this.videoId = videoId;
      content.videoId = videoId;
      return content;
    });

  }
  queueUpload (request, deferred) {
    let uri = request._req ? request._req.uri : request.uri,
      uploadDetails = {
        url: uri.format(),
        cancel: request.abort.bind(request),
        deferred: deferred
      };

    this.queue.add(uploadDetails);
    deferred.promise.finally( () => {
      this.queue.delete(uploadDetails);
    });

  }
  cancel () {
    let promise = super.cancel();
    for (let upload of this.queue) {
      upload.cancel();
      upload.deferred.reject('cancelled');
    }
    return promise;
  }
  start (rev, config) {
    super.start();

    _.extend(this.config, config);

    let uploadPromise = this.upload.apply(this, arguments);

    // stats: {percentage, transferred, length, remaining, eta, runtime}
    return uploadPromise
      .progress(this.notify.bind(this))
      .then(this.end.bind(this))
      .catch(this.fail.bind(this));
  }
  get fileData () {
    var config = this.config,
        instance;

    if (config.fileData) {
      return config.fileData;
    }

    if (config.preferredWidth) {
      instance = this.content.getInstanceAtWidth(config.preferredWidth);
    } else {
      instance = this.content.getBestInstance();
    }

    if (!instance) {
      instance = this;
    }

    return this.getAbsolutePath(instance.relativeFilePath);
  }
  getAbsolutePath (relativePath) {
    return path.resolve(this.config.backupFolder, _.trimLeft(relativePath, '/\\'));
  }
  get videoId () { return this.config.videoId; }
  set videoId (id) { this.config.videoId = id; return id; }
}

module.exports = UploadTask;
