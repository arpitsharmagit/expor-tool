'use babel';
'use strict';

var Q = require('q'),
    _ = require('lodash'),
    path = require('path'),
    ProgressStream = require('../util/ProgressStream'),
    fs = require('fs'),
    stream = require('stream'),
    _private = require('../util/private-store').create(),
    FileUtil = require('../util/FileUtil'),
    TimeUtil = require('../util/TimeUtil'),
    Logger = require('../util/Logger'),
    log = new Logger('upload');

log.loud();
Q.onerror = log.error.bind(log);

class UploadService {
  constructor (revConnection) {
    var $resource = revConnection.resource;

    // store private variablese
    _private(this, {
      rev: revConnection,
      dispatchCommand: revConnection.dispatchCommand,
      videoEditResource: $resource('/media/videos/:videoId/edit'),
      uploadResource: $resource(':uploadUri')
    });
  }
  createVideo (video) {
    var title = _.isObject(video) ? video.title : video;

    return _private(this).dispatchCommand("media:AddVideoToAccount", {
      title: title
    }).then( (result) => {
      if(result.type === 'VideoCreated'){
        // FIXME: I don't know why i still have 'id' in there....
        return {
          id: result.data.videoId,
          videoId: result.data.videoId,
          videoUploadUri: result.data.videoUploadUri
        };
      }
    });
  }

  createVideoLink (video) {
    return _private(this).dispatchCommand("media:CreateVideoLink", {
      url: video.url,
      type: video.type,
      encodingType: video.encodingType
    });
  }
  uploadVideo (fileData, metadata = {}, options = {}) {
    var deferred = Q.defer(),
        rev = _private(this).rev,
        { skipMetadataUpdate } = options;

    metadata = _.defaults({}, metadata, rev.media.videoTemplate);

    let uploadProcess = Q.async(function* () {
      var p;

      // create initial video record
      p = this.createVideo(metadata);

      let {videoId, videoUploadUri} = yield p;


      // subscribe to this video's events
      /*let videoRoute = rev.push.addRouteListener(videoId, 'VideoUploadingFinished', ['VideoUploadingCanceled', 'VideoUploadingFailed']);
      videoRoute.progress(deferred.notify);*/


      // actually perform upload
      try {
        let uploadPromise = this.uploadImpl(videoUploadUri, fileData, {}, options);

        uploadPromise.progress(deferred.notify);

        // TODO: will this cause memory leak?
        log.debug('about to start upload', videoUploadUri);

        //p = Q.all(videoRoute, uploadPromise);
        //yield p;
        let filename = yield uploadPromise;

        // add metadata
        if (!metadata.title) {
          metadata.title = filename;
        }
        metadata.videoId = videoId;

        if (!skipMetadataUpdate) {
          let editPromise = rev.media.modifyVideo(metadata);
          yield editPromise;
        }

        return yield Q.resolve(videoId);

      } catch (err) {
        log.warn('error on upload, cancelling', err);
        p = this.cancelUpload(videoId);
        yield p;
        return yield Q.reject(err);
      }

      // how to provide status updates?
      // listen for upload events on account route?

    }).call(this);

    deferred.resolve(uploadProcess);

    return deferred.promise;
  }
  cancelUpload (videoId) {
    return _private(this).dispatchCommand("media:CancelUploadingVideo", { videoId: videoId }).then( (result) => {
      log.info("Upload Canceled");
    }, (err) => {
      log.warn("Upload cancel failed: ", err);
    });
  }
  createThumbnail (videoId) {
    let image = {
      videoId: videoId
    };
    return _private(this).dispatchCommand("media:AddImageToVideo", image)
      .then( (result) => {

        if (result.type === 'ImageCreated') {
          return {
            id: result.data.imageId,
            imageId: result.data.imageId,
            videoId: videoId,
            imageUploadUri: result.data.imageUploadUri
          };
        }
      });
  }
  uploadThumbnail (video, fileData, options = {}) {
    var deferred = Q.defer(),
        rev = _private(this).rev,
        videoId = _.isString(video) ? video : video.videoId || video.id,
        { skipMetadataUpdate } = options;

    let uploadProcess = Q.async(function* () {
      var p, thumbnailUri;

      // create initial video record
      p = this.createThumbnail(videoId);
      let {imageId, imageUploadUri} = yield p;

      // thumbnail uri is returned along video route
      // transient means it will timeout eventually if no response
      let imageStorePromise = rev.push.addTransientRouteListener(videoId, 'ImageStoringFinished', ['ImageUploadFailed', 'ImageStoringFailed'])
        .then( (result) => {
          return result.message;
        });

      try {
        let uploadPromise = this.uploadImpl(imageUploadUri, fileData, {}, options);

        yield uploadPromise;

        let storedThumbnail = yield imageStorePromise;

        thumbnailUri = storedThumbnail.thumbnailUri;

        // if processing in a batch then you can skip updating the metadata
        if (skipMetadataUpdate) {
          return yield Q.resolve(thumbnailUri);
        }
        // make sure that you have all most recent video details
        p = rev.media.getVideo(videoId);
        let {video: videoDetails, mediaContent: videoMediaContent } = yield p;

        // update with new info
        videoDetails.thumbnailUri = thumbnailUri;
        videoDetails.videoId = videoId;
        videoDetails.mediaContent = videoMediaContent;

        p = rev.media.modifyVideo(videoDetails);
        yield p;

        return yield Q.resolve(thumbnailUri);

      } catch (err) {
        p = rev.media.deleteThumbnail(imageId, videoId);
        yield p;

        return yield Q.reject(err);
      }



    }).call(this);

    deferred.resolve(uploadProcess);

    return deferred.promise;
  }
  isValidSupplementalContentFile (extension) {
    return FileUtil.isPresentationFile(extension) || FileUtil.isDocumentFile(extension) ||
      FileUtil.isSpreadsheetFile(extension) || FileUtil.isArchiveFile(extension) ||
      FileUtil.isImageFile(extension);
  }
  createSupplementalContent (videoId, filename) {
    var content;
    if (_.isObject(videoId)) {
      content = _.pick(videoId, ['videoId', 'filename']);
    } else {
      content = { videoId: videoId, filename: filename };
    }
    return _private(this).dispatchCommand("media:AddMediaContent", content, 'MediaContentAdded')
      .then( (result) => {
        return {
          videoId: videoId,
          id: result.message.mediaContentId,
          mediaContentId: result.message.mediaContentId,
          mediaContentUploadUri: result.message.mediaContentUploadUri
        };
      });
  }

  /*
   * content = {
      id: mediaContentId (returned from addmediacontent),
      videoId: ...
      filename: ...
    }
    upload to result.message.mediaContentUploadUri
   */
  uploadSupplementalContent (video, fileData, options = {}) {
    var deferred = Q.defer(),
        rev = _private(this).rev,
        videoId = _.isString(video) ? video : video.videoId || video.id,
        { skipMetadataUpdate } = options;

    let uploadProcess = Q.async(function* () {
      var p;

      // create initial video record
      p = this.createSupplementalContent(videoId);
      let {mediaContentId, mediaContentUploadUri } = yield p;

      // thumbnail uri is returned along video route
      // FIXME this will timeout, but could timeout before upload completes on slow connections
      let storePromise = rev.push.addTransientRouteListener(videoId, 'MediaContentStoringFinished', ['MediaContentUploadFailed', 'MediaContentStoringFailed'])
        .then( (result) => {
          return result.message;
        });

      try {
        let uploadPromise = this.uploadImpl(mediaContentUploadUri, fileData, {}, options);

        uploadPromise.progress(deferred.notify);

        let filename = yield uploadPromise,
            title = path.parse('' + filename).name;

        let storedContent = yield storePromise,
            mediaContent = { id: mediaContentId, title: title };

        log.info('media upload complete', storedContent, filename, title);

        if (skipMetadataUpdate) {
          return yield Q.resolve(mediaContent);
        }

        // make sure that you have all most recent video details
        p = rev.media.getVideo(videoId);
        let {video: videoDetails} = yield p;

        // update with new info
        videoDetails.videoId = videoId;
        videoDetails.mediaContent = [mediaContent];

        p = rev.media.modifyVideo(videoDetails);
        yield p;

        return yield Q.resolve(mediaContent);

      } catch (err) {
        p = this.cancelSupplementalContentUpload(mediaContentId, videoId);

        yield p;

        return yield Q.reject(err);
      }
    }).call(this);

    deferred.resolve(uploadProcess);

    return deferred.promise;
  }
  cancelSupplementalContentUpload (mediaContentId, videoId) {
    return _private(this)
      .dispatchCommand('media:CancelUploadingMediaContent', {
        videoId: videoId,
        mediaContentId: mediaContentId
      });
  }
  /*
   * fileData can be:
   *    string (file path)
   *    { field: field name, path: file path, options: {} }
   *    { field: field name, value: ReadableStream }
   */
  uploadImpl (uploadUri, fileData, formData = {}, options = {}) {
    var deferred = Q.defer(),
        promise = deferred.promise,
        uploadResource = _private(this).uploadResource,
        progressCallback = options.progressCallback || _.noop,
        progressInterval = options.progressInterval || 1000,
        beforeSend = options.beforeSend;

    return Q.async(function* () {
      let p, length, filename, readStream;


      // create read file stream, and set up progress notifications
      if (_.isString(fileData)) {
        fileData = {
          field: 'upload',
          value: fileData
          // options: { filename, contentType }
        };
      }

      if (!_.isObject(fileData)) {
        return yield Q.reject('Invalid file data for upload: ' + fileData);
      }

      // allow passing of streams instead of default filepath
      if (fileData.value instanceof stream.Stream) {
        length = fileData.length || 0;

        try {
          filename = path.basename(fileData.value.path);
        } catch (err) {
          filename = 'Unknown';
        }

        readStream = fileData.value;

      } else {
        try {
          //filepath = fileData.value;
          p = Q.denodeify(fs.stat)(fileData.value);
          let stat = yield p;
          length = stat.size;

          if (!stat.isFile()) {
            return Q.reject(new Error('Not a file: ' + fileData.value));
          }

          filename = path.basename(fileData.value);
          readStream = fs.createReadStream(fileData.value);

        } catch (err) {
          if (err.code === 'ENOENT') {
            log.error('file does not exist: ' + fileData.value, err);
            err.message = 'File Does Not Exist: ' + fileData.value;
          } else if (err.code === 'EISDIR') {
            log.error('found directory instead of file: ' + fileData.value, err);
            err.message = 'File Is Directory: ' + fileData.value;
          } else if (err.code === 'EPERM') {
            log.error('File access denied: ' + fileData.value, err);
            err.message = 'File access denied: ' + fileData.value;
          } else {
            log.error('unknown fstat error', err);
          }
          return yield Q.reject(err);
        }

      }

      // pipe input stream through progressStream to track progress
      let progressStream = new ProgressStream({
            length: length,
            interval: progressInterval
          });

      progressStream.on('progress', (progress) => {
        updatePromiseProgressImpl(deferred, progress.percentage, progress);
      });

      if (_.isFunction(progressCallback)) {
        listenPromiseProgressImpl(promise, progressCallback);
      }

      fileData.field = fileData.field || 'upload';
      fileData.value = readStream.pipe(progressStream);

      // add file upload to form
      if (fileData.options) {
        formData[fileData.field] = fileData;
      } else {
        formData[fileData.field] = fileData.value;
      }

      // set the upload timeout to match the expected maximum duration for transfer
      let MINIMUM_BITRATE = 56 * 1000, // 56kbps
          MINIMUM_TIMEOUT = 30, // 30 seconds
          MAXIMUM_TIMEOUT = 60 * 60 * 4, // 4 hours
          uploadTimeoutInSeconds = Math.min(Math.max(MINIMUM_TIMEOUT, length / MINIMUM_BITRATE), MAXIMUM_TIMEOUT);
      // do we need vbrickAccessToken in querystring?
      // uses request library (via RestService)
      // return filename (otherwise returns undefined)
      let requestPromise = uploadResource
        .post({uploadUri: uploadUri}, {
          formData: formData,
          beforeSend: beforeSend,
          timeout: uploadTimeoutInSeconds * 1000
         });
      readStream.resume();

      // resolve the returned promise when p is complete
      requestPromise
        .then((response) => response || filename)
        .then(deferred.resolve)
        .catch(deferred.reject)
        .finally( (x, y) => { log.debug('Request Promise in Upload Impl complete', x, filename); })
        .done();

      yield requestPromise;

      return yield promise;

      //return yield promise;
    }).call(this);
  }
}

// wrapper around promise progress functions, because Q v.2 will depreciate this method
function updatePromiseProgressImpl(deferred, progress, data) {
  if (deferred.notify) {
    return deferred.notify({
      eventType: 'UploadProgress',
      progress: progress,
      message: data
    });
  }
}

function listenPromiseProgressImpl(promise, callback) {
  return promise.then(undefined, undefined, callback);
}

module.exports = UploadService;
