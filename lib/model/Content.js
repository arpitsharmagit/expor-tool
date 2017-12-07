'use babel';
'use strict';

var _ = require('lodash'),
    ModelBase = require('./ModelBase'),
    Category = require('./Category'),
    Comment = require('./Comment'),
    Attachment = require('./Attachment'),
    UserGroup = require('./UserGroup'),
    helpers, schema;

_.mixin(require('../util/lodashMixins'));

helpers = {
	attributeSelector: function (key) {
		return '.contentattribute *:has(.key:val("' + key + '")) .value';
	},
	testEqualTo: function (testValue) {
		return function (val) { return val == testValue; };
	},
	toInteger: function (val) {
		return parseInt(val, 10);
	}
};

schema = {
  vendorId: {
		selector: '> .id .ccsid'
	},
  videoId: {
		revKey: 'id'
	},
	title: {
		selector: '> .title',
		revKey: 'title'
	},
	description: {
		selector: '> .description',
		revKey: 'description'
	},
	tags: {
		type: 'object',
		selector: helpers.attributeSelector('tags'),
		transform: function (val) {
			return val ? val.split(/,\W*/) : []; // split into array
		},
		revKey: 'tags',
    default: []
	},
	// instances: 'notImplementedYet'
	author: {
		selector: '> .author .username',
		association: {
			hasMany: false,
			model: 'User',
			key: 'username'
		}
	},
  uploaderUserId: {
    revKey: 'uploaderUserId'
  },
	createdBy: {
		selector: '> .createdby .username',
		association: {
			hasMany: false,
			model: 'User',
			key: 'username'
		},
		revKey: 'createdBy'
	},
	whenUploaded: {
		type: 'datetime',
		selector: '> .lastpublisheddate .date',
		transform: function (val) {
			return new Date(parseInt(val, 10));
		},
		revKey: 'whenUploaded'
	},

	// providing relative url, since that's what the backup's gonna come frome
	relativeFilePath: {
		selector: '> .video > .videoasset > .relativefilepath',
		optional: true //,
		//revKey: 'videoKey'
	},
	// in case of external including this as well
  linkedUrl: {
		selector: '> .video > .videoasset > .uri .urivalue',
		transform: function (urls) {
			if (!Array.isArray(urls)) {
				return urls;
			} else {
				// sorting will return http:// before rtmp://
				return urls.sort()[0];
			}
		},
		optional: true,
		revKey: 'externalUrl'
	},
  thumbnailUri: {
    revKey: 'thumbnailUri'
  },
	// providing relative url, since that's what the backup's gonna come frome
	// NOTE: not creating full Model for thumbnail, because we'll only need the URL
  vendorThumbnail: {
		selector: '> .contentthumbnail .imageasset > *',
		transform: function (thumbnails) {
			// if single thumbnail instead of array
			if (!Array.isArray(thumbnails)) {
				return thumbnails.relativefilepath;
			}

			thumbnails.sort(function (a, b) {
				var sizeA = parseInt(a.width, 10) * parseInt(a.height, 10),
						sizeB = parseInt(b.width, 10) * parseInt(b.height, 10);

				return (sizeA === sizeB) ? 0 : (sizeA > sizeB) ? -1 : 1;
			});

			return thumbnails[0].relativefilepath;
		},
		//revKey: 'thumbnailUri',
		workflow: 'copy thumbnail'
	}, // should fill in separately
  transcript: {
    __model: 'Attachment',
    selector: '> .video > .transcript > .transcriptasset',
    transform: function (val) {
      return _.bubble(val).map(Attachment.fromVendorObject.bind(Attachment));
    },
		optional: true
  },
	duration: {
		type: 'int',
		selector: helpers.attributeSelector('duration'),
		transform: helpers.toInteger,
		revKey: 'duration'
	},
  isLive: {
    type: 'boolean',
    selector: '> .video .live',
    transform: helpers.testEqualTo('true'),
    optional: true
  },
	formatType: {
		selector: helpers.attributeSelector('encoding'),
		transform: function (val) {
			return val; // "h264" so far...
		},
    optional: true,
		revKey: 'formatType'
	},
	containerType: {
		selector: helpers.attributeSelector('videoformat'),
		transform: function (val) {
			if (val === 'MPEG') {
				return 'MP4';
			} else {
				return val;
			}
		},
    optional: true,
		revKey: 'containerType'
	},
	// for nonlinear destructive editing
	transcode: {
		selector: '> .edl',
		optional: true,
		workflow: 'transcode video'
		// returns xml, keep as string for now
	},

	// TODO: how to store attachments, what's the schema?
	attachments: {
    __model: 'Attachment',
		selector: '> .attachment',
		// transform: not transforming yet, but probably should
    transform: function (val) {
      return _.bubble(val).map(Attachment.fromVendorObject.bind(Attachment));
    },
    /*revTransform: function (attachments) {
      return _.map(attachments, (attachment) => attachment.toRevData.call(attachment));
    },*/
		optional: true,
    revKey: 'mediaContent',
    default: [],
		workflow: 'copy attachments'
	},
	views: {
		type: 'int',
		selector: helpers.attributeSelector('viewCount'),
		transform: helpers.toInteger
	},
	averageRating: {
		type: 'int',
		selector: helpers.attributeSelector('rating'),
		transform: helpers.toInteger
	},
	ratingCount: {
		type: 'int',
		selector: helpers.attributeSelector('ratingCount'),
		transform: helpers.toInteger
	},
	filesize: {
		type: 'int',
		selector: helpers.attributeSelector('size'),
		transform: helpers.toInteger
	},
	commentCount: {
		type: 'int',
		selector: helpers.attributeSelector('discussedCount'),
		transform: helpers.toInteger,
		workflow: 'get comments'
	},
	//downloadingEnabled: 'notImplemented',
	// this could be 'hiddenflag', 'contentstate', or pulled from categories
	enableTags: {
		type: 'boolean',
		selector: helpers.attributeSelector('allowTags'),
		transform: helpers.testEqualTo('true')
	},
	enableComments: {
		type: 'boolean',
		selector: helpers.attributeSelector('allowComments'),
		transform: helpers.testEqualTo('true'),
		revKey: 'commentsEnabled'
	},
	enableAnonymousComments: {
		type: 'boolean',
		selector: helpers.attributeSelector('allowAnonymousComments'),
		transform: helpers.testEqualTo('true'),
		optional: true
	},
	enableRatings: {
		type: 'boolean',
		selector: helpers.attributeSelector('allowRatings'),
		transform: helpers.testEqualTo('true'),
		// FIXME: don't know what this actually is via REST API
		revKey: 'ratingsEnabled',
    default: true
	},
	enableDownloads: {
		revKey: 'downloadingEnabled',
    default: false
	},
	//enableRecommendations: 'notImplemented',
	// enableCategories: 'notImplemented',

  /* PERMISSIONS */
  isActive: {
    type: 'boolean',
    selector: '> .hiddenflag',
    transform: helpers.testEqualTo('false'),
    revKey: 'isActive',
    default: true
	},
  accessControl: {
    revKey: 'accessControl',
    default: 'Public',
    revTransform: function (value) {
      if (this.usergroups && this.usergroups.length) {
        return 'Private';
      } else {
        return 'Public';
      }
    }
  },
  categories: {
    __model: 'Category',
    type: 'object',
    default: [],
    selector: '> .groupscontainingcontent',
    transform: function (value) {
      return _.bubble(value).map(Category.fromVendorObject.bind(Category));
    },
    revTransform: function (value) {
      return _(value).bubble()
          .pluck('categoryId')
          .filter(_.identity).value();
    },
    optional: true,
    revKey: 'categoryIds'
  },
  // TODO: need to create Comment model
  comments: {
    __model: 'Comment',
    type: 'object',
    default: [],
    selector: '> .comment',
    transform: function (value) {
      var result = _.bubble(value).map(Comment.fromVendorObject.bind(Comment));
      return _.flatten(result);
    },
    /*revTransform: function (comments) {
      return _.map(_.bubble(comments), (comment) => comment.toRevData.call(comment));
    },*/
    optional: true,
    revKey: 'comments'
  },
  usergroups: {
    __model: 'UserGroup',
    type: 'object',
    default: [],
    selector: '> .viewers .usergroup',
    transform: function (value) {
      return _.bubble(value).map(UserGroup.fromVendorObject.bind(UserGroup));
    },
    optional: true,
    revKey: 'accessControlEntities',
    /*revTransform: function (teams) {
      return _.map(_.bubble(teams), (team) => team.toRevData.call(team));
    }*/
  },
  vendorInstances: {
    type: 'object',
    selector: '> .video .videoasset',
    transform: function (assets) {
      assets = _.bubble(assets);
      return assets.map( function (asset) {
        // get first http url available (or none)
        let url = _(asset.uri)
              .bubble().pluck('urivalue')
              .find( (url) => /^http/.test(url) );

        return {
          bitrate: helpers.toInteger(asset.bitrate),
          width: helpers.toInteger(asset.width),
          height: helpers.toInteger(asset.height),
          size: helpers.toInteger(asset.filesize),
          relativeFilePath: asset.relativefilepath,
          url: url
        };
      });
    },
    optional: true
  },

  pulseAnalytics: {
    type: 'object',
    selector: '> .video .mediaAnalytics',
    optional: true
  }

};

let defaultContent = {
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
  //title: '' not setting title to make sure that *some* metadata gets added
};

// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?
class Content extends ModelBase {
  constructor (data) {
    super(data);

  }
  // sorts the available instances and gets the best quality one
  // only local is default -- only gets instances that have file in backup
  hasInstances () {
    return !_.isEmpty(this.vendorInstances);
  }
  getBestInstance (onlyLocal = true) {
    let whereFn = onlyLocal ? _.property('relativeFilePath') : _.noop;

    return _(this.vendorInstances)
      .where(whereFn)
      .sortByAll(['size', 'bitrate', 'width', 'height'])
      .last();
  }
  getInstanceAtWidth (width, onlyLocal = true) {
    let whereFn = onlyLocal ? _.property('relativeFilePath') : _.noop;
    return _(this.vendorInstances)
    .where(whereFn)
      .sortBy( (instance) => Math.abs(width - instance.width) )
      .first();
  }
  static get default () {
    return defaultContent;
  }

  static get className () {
    return 'Content';
  }
  static get vendorType () {
    return 'vpcontent';
  }
  static get revType () {
    return 'video';
  }
  static get schema () {
    return schema;
  }
}

Content.register();

module.exports = Content;
