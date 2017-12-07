'use babel';
'use strict';


var Q = require('q'),
    _ = require('lodash'),
    _private = require('../util/private-store').create(),
    FileUtil = require('../util/FileUtil'),
    TimeUtil = require('../util/TimeUtil');

// just in case, allow capitalized versions as well
const validModifyVideoKeys = [
      'anonymousViewingEnabled', 'categoryId', 'commentsEnabled', 'description', 'downloadingEnabled', 'isActive', 'libraryIds', 'linkedUrl', 'mediaContent', 'ratingsEnabled', 'tags', 'thumbnailUri', 'title', 'videoId', 'pendingThumbnailId', 'accessControl', 'accessControlEntities', 'categoryIds',
      'AnonymousViewingEnabled', 'CategoryId', 'CommentsEnabled', 'Description', 'DownloadingEnabled', 'IsActive', 'LibraryIds', 'LinkedUrl', 'MediaContent', 'RatingsEnabled', 'Tags', 'ThumbnailUri', 'Title', 'VideoId', 'PendingThumbnailId', 'AccessControl', 'AccessControlEntities', 'CategoryIds'
    ];

const ACCESS_CONTROL = {
  PUBLIC: 'Public',
  ALLUSERS: 'AllUsers',
  PRIVATE: 'Private'
};

let videoTemplate = {
  accessControl: 'Public',
  accessControlEntities: [],
  categoryIds: [],
  commentsEnabled: true,
  description: '',
  downloadingEnabled: false,
  isActive: true,
  linkedUrl: null,
  mediaContent: [],
  ratingsEnabled: true,
  tags: [],
  thumbnailUri: null
};

class MediaService {
  constructor (revConnection) {
    var $resource = revConnection.resource;

    // store private variablese
    _private(this, {
      rev: revConnection,
      dispatchCommand: revConnection.dispatchCommand,
      videoEditResource: $resource('/media/videos/:videoId/edit'),
      videoPlaybackResource: $resource('/media/videos/:videoId'),
      videoPlaybackEmbedResource: $resource('/media/videos/:videoId/embed'),
      categoryResource: $resource('/media/accounts/:accountId/categories'),
      authorDateResource: $resource('/api/v1/videos/:videoId/migration')
    });

  }

  getVideo (videoId) {
    return _private(this).videoEditResource
      .get({ videoId: videoId })
      .then(function(response) {
        generateSupplementalContentExtensions(response.videoMediaContent);
        return response;
      });
  }



  getVideoPlayback (videoId) {
    return _private(this).videoPlaybackResource.get({ videoId: videoId })
      .then(function (response) {
        response.videoUser = response.videoUser || {};
        generateSupplementalContentExtensions(response.videoMediaContent);

        var video = response.video;
        video.whenUploaded = TimeUtil.parseUTCDate(video.whenUploaded);
        video.averageRating = Math.round(video.averageRating);
        video.duration = TimeUtil.parseCSharpTimespan(video.duration);
        video.comments = (video.comments || []);
        _.each(video.comments, (comment) => {
          comment.videoId = video.id;
          comment.date = TimeUtil.parseUTCDate(comment.date);
          comment.showReplies = true;

          _.each(comment.childComments, (childComment) => {
            childComment.parentCommentId = comment.id;
            childComment.videoId = video.id;
            childComment.date = TimeUtil.parseUTCDate(childComment.date);
          });
        });

        if (video.presentation) {
          _.each(video.presentation.timeline, (transition) => {
            transition.time = TimeUtil.parseCSharpTimespan(transition.time);
          });
        }

        return response;
      });
  }

  getCategories (accountId = _private(this).rev.accountId) {
    return _private(this).categoryResource.get({ accountId: accountId });
  }

  // NOTE this will throw an error by API if invalid/missing object sent
  modifyVideo (video = {}) {
    let finalEvents = ['VideoDetailsSaved', 'CommandFinished'];
    video = _.pick(video, validModifyVideoKeys);
    return _private(this).dispatchCommand("media:SaveVideoDetails", video, finalEvents);
  }

  setAuthorAndUploadDate (videoId, userName, whenUploaded) {
    let date = new Date(whenUploaded);
    if (date.toString() === 'Invalid Date') {
      return Q.reject('Invalid Date');
    }

    return _private(this).authorDateResource.put({
      videoId: videoId,
      UserName: userName,
      whenUploaded: date
    });
  }

  setVideoStatus (videoId, isActive) {
    if (_.isUndefined(isActive)) {
      return Q.reject('must specify active status (2nd arg boolean)');
    }
    return Q.async(function* () {
      let p = this.getVideo(videoId),
          {video: videoDetails, mediaContent: videoMediaContent } = yield p;

      videoDetails.videoId = videoId;
      videoDetails.mediaContent = videoMediaContent;

      videoDetails.isActive = !!isActive;

      return yield this.modifyVideo(videoDetails);

    }).call(this);
  }

  rateVideo (videoRating) {
    return _private(this).dispatchCommand("media:RateVideo", videoRating);
  }

  deleteThumbnail(imageId, videoId) {
    return _private(this).dispatchCommand("media:DeleteImage", {imageId: imageId, videoId: videoId});
  }

  deleteVideo(videoId) {
    return _private(this).dispatchCommand("media:DeleteVideo", {videoId: videoId});
  }

  getVideoPlaybackEmbed (videoId) {
    return _private(this).videoPlaybackEmbedResource.get({videoId: videoId});
  }

  deleteSupplementalContent (content) {
    return _private(this)
      .dispatchCommand('media:RemoveMediaContent', {
        mediaId: content.videoId,
        mediaContentId: content.id
      });
  }

  /******************** COMMENTS ***************/
  addRootVideoComment (comment) {
    let finalEvents = ['RootVideoCommentAdded ', 'CommandFinished'];
		return _private(this).dispatchCommand('media:AddRootVideoComment', {
			videoId: comment.videoId,
			text: comment.text
		}, finalEvents);
	}

	addChildVideoComment (comment) {
    let finalEvents = ['ChildVideoCommentAdded ', 'CommandFinished'];
		return _private(this).dispatchCommand('media:AddChildVideoComment', {
			videoId: comment.videoId,
			parentCommentId: comment.parentCommentId,
			text: comment.text
		}, finalEvents);
	}

	removeComment (comment) {
    _private(this).dispatchCommand('media:RemoveVideoComment', {
			videoId: comment.videoId,
			commentId: comment.id,
			parentCommentId: comment.parentCommentId
		});

	}

  get videoTemplate () {
    return videoTemplate;
  }

}

function generateSupplementalContentExtensions (supplementalContent) {
  if (supplementalContent) {
    supplementalContent.forEach( (content) => {
      var parsed = FileUtil.parseFileName(content.filename);
      if (parsed) {
        var extension = content.extension = parsed.extension;
        content.isImageFile = FileUtil.isImageFile(extension);
      }
    });
  }
}

module.exports = MediaService;
