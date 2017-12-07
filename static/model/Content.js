"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var _ = require("lodash"),
    ModelBase = require("./ModelBase"),
    Category = require("./Category"),
    Comment = require("./Comment"),
    Attachment = require("./Attachment"),
    UserGroup = require("./UserGroup"),
    helpers,
    schema;

_.mixin(require("../util/lodashMixins"));

helpers = {
	attributeSelector: function attributeSelector(key) {
		return ".contentattribute *:has(.key:val(\"" + key + "\")) .value";
	},
	testEqualTo: function testEqualTo(testValue) {
		return function (val) {
			return val == testValue;
		};
	},
	toInteger: function toInteger(val) {
		return parseInt(val, 10);
	}
};

schema = {
	vendorId: {
		selector: "> .id .ccsid"
	},
	videoId: {
		revKey: "id"
	},
	title: {
		selector: "> .title",
		revKey: "title"
	},
	description: {
		selector: "> .description",
		revKey: "description"
	},
	tags: {
		type: "object",
		selector: helpers.attributeSelector("tags"),
		transform: function transform(val) {
			return val ? val.split(/,\W*/) : []; // split into array
		},
		revKey: "tags",
		"default": []
	},
	// instances: 'notImplementedYet'
	author: {
		selector: "> .author .username",
		association: {
			hasMany: false,
			model: "User",
			key: "username"
		}
	},
	uploaderUserId: {
		revKey: "uploaderUserId"
	},
	createdBy: {
		selector: "> .createdby .username",
		association: {
			hasMany: false,
			model: "User",
			key: "username"
		},
		revKey: "createdBy"
	},
	whenUploaded: {
		type: "datetime",
		selector: "> .lastpublisheddate .date",
		transform: function transform(val) {
			return new Date(parseInt(val, 10));
		},
		revKey: "whenUploaded"
	},

	// providing relative url, since that's what the backup's gonna come frome
	relativeFilePath: {
		selector: "> .video > .videoasset > .relativefilepath",
		optional: true //,
		//revKey: 'videoKey'
	},
	// in case of external including this as well
	linkedUrl: {
		selector: "> .video > .videoasset > .uri .urivalue",
		transform: function transform(urls) {
			if (!Array.isArray(urls)) {
				return urls;
			} else {
				// sorting will return http:// before rtmp://
				return urls.sort()[0];
			}
		},
		optional: true,
		revKey: "externalUrl"
	},
	thumbnailUri: {
		revKey: "thumbnailUri"
	},
	// providing relative url, since that's what the backup's gonna come frome
	// NOTE: not creating full Model for thumbnail, because we'll only need the URL
	vendorThumbnail: {
		selector: "> .contentthumbnail .imageasset > *",
		transform: function transform(thumbnails) {
			// if single thumbnail instead of array
			if (!Array.isArray(thumbnails)) {
				return thumbnails.relativefilepath;
			}

			thumbnails.sort(function (a, b) {
				var sizeA = parseInt(a.width, 10) * parseInt(a.height, 10),
				    sizeB = parseInt(b.width, 10) * parseInt(b.height, 10);

				return sizeA === sizeB ? 0 : sizeA > sizeB ? -1 : 1;
			});

			return thumbnails[0].relativefilepath;
		},
		//revKey: 'thumbnailUri',
		workflow: "copy thumbnail"
	}, // should fill in separately
	transcript: {
		__model: "Attachment",
		selector: "> .video > .transcript > .transcriptasset",
		transform: function transform(val) {
			return _.bubble(val).map(Attachment.fromVendorObject.bind(Attachment));
		},
		optional: true
	},
	duration: {
		type: "int",
		selector: helpers.attributeSelector("duration"),
		transform: helpers.toInteger,
		revKey: "duration"
	},
	isLive: {
		type: "boolean",
		selector: "> .video .live",
		transform: helpers.testEqualTo("true"),
		optional: true
	},
	formatType: {
		selector: helpers.attributeSelector("encoding"),
		transform: function transform(val) {
			return val; // "h264" so far...
		},
		optional: true,
		revKey: "formatType"
	},
	containerType: {
		selector: helpers.attributeSelector("videoformat"),
		transform: function transform(val) {
			if (val === "MPEG") {
				return "MP4";
			} else {
				return val;
			}
		},
		optional: true,
		revKey: "containerType"
	},
	// for nonlinear destructive editing
	transcode: {
		selector: "> .edl",
		optional: true,
		workflow: "transcode video"
		// returns xml, keep as string for now
	},

	// TODO: how to store attachments, what's the schema?
	attachments: {
		__model: "Attachment",
		selector: "> .attachment",
		// transform: not transforming yet, but probably should
		transform: function transform(val) {
			return _.bubble(val).map(Attachment.fromVendorObject.bind(Attachment));
		},
		/*revTransform: function (attachments) {
    return _.map(attachments, (attachment) => attachment.toRevData.call(attachment));
  },*/
		optional: true,
		revKey: "mediaContent",
		"default": [],
		workflow: "copy attachments"
	},
	views: {
		type: "int",
		selector: helpers.attributeSelector("viewCount"),
		transform: helpers.toInteger
	},
	averageRating: {
		type: "int",
		selector: helpers.attributeSelector("rating"),
		transform: helpers.toInteger
	},
	ratingCount: {
		type: "int",
		selector: helpers.attributeSelector("ratingCount"),
		transform: helpers.toInteger
	},
	filesize: {
		type: "int",
		selector: helpers.attributeSelector("size"),
		transform: helpers.toInteger
	},
	commentCount: {
		type: "int",
		selector: helpers.attributeSelector("discussedCount"),
		transform: helpers.toInteger,
		workflow: "get comments"
	},
	//downloadingEnabled: 'notImplemented',
	// this could be 'hiddenflag', 'contentstate', or pulled from categories
	enableTags: {
		type: "boolean",
		selector: helpers.attributeSelector("allowTags"),
		transform: helpers.testEqualTo("true")
	},
	enableComments: {
		type: "boolean",
		selector: helpers.attributeSelector("allowComments"),
		transform: helpers.testEqualTo("true"),
		revKey: "commentsEnabled"
	},
	enableAnonymousComments: {
		type: "boolean",
		selector: helpers.attributeSelector("allowAnonymousComments"),
		transform: helpers.testEqualTo("true"),
		optional: true
	},
	enableRatings: {
		type: "boolean",
		selector: helpers.attributeSelector("allowRatings"),
		transform: helpers.testEqualTo("true"),
		// FIXME: don't know what this actually is via REST API
		revKey: "ratingsEnabled",
		"default": true
	},
	enableDownloads: {
		revKey: "downloadingEnabled",
		"default": false
	},
	//enableRecommendations: 'notImplemented',
	// enableCategories: 'notImplemented',

	/* PERMISSIONS */
	isActive: {
		type: "boolean",
		selector: "> .hiddenflag",
		transform: helpers.testEqualTo("false"),
		revKey: "isActive",
		"default": true
	},
	accessControl: {
		revKey: "accessControl",
		"default": "Public",
		revTransform: function revTransform(value) {
			if (this.usergroups && this.usergroups.length) {
				return "Private";
			} else {
				return "Public";
			}
		}
	},
	categories: {
		__model: "Category",
		type: "object",
		"default": [],
		selector: "> .groupscontainingcontent",
		transform: function transform(value) {
			return _.bubble(value).map(Category.fromVendorObject.bind(Category));
		},
		revTransform: function revTransform(value) {
			return _(value).bubble().pluck("categoryId").filter(_.identity).value();
		},
		optional: true,
		revKey: "categoryIds"
	},
	// TODO: need to create Comment model
	comments: {
		__model: "Comment",
		type: "object",
		"default": [],
		selector: "> .comment",
		transform: function transform(value) {
			var result = _.bubble(value).map(Comment.fromVendorObject.bind(Comment));
			return _.flatten(result);
		},
		/*revTransform: function (comments) {
    return _.map(_.bubble(comments), (comment) => comment.toRevData.call(comment));
  },*/
		optional: true,
		revKey: "comments"
	},
	usergroups: {
		__model: "UserGroup",
		type: "object",
		"default": [],
		selector: "> .viewers .usergroup",
		transform: function transform(value) {
			return _.bubble(value).map(UserGroup.fromVendorObject.bind(UserGroup));
		},
		optional: true,
		revKey: "accessControlEntities" },
	vendorInstances: {
		type: "object",
		selector: "> .video .videoasset",
		transform: function transform(assets) {
			assets = _.bubble(assets);
			return assets.map(function (asset) {
				// get first http url available (or none)
				var url = _(asset.uri).bubble().pluck("urivalue").find(function (url) {
					return /^http/.test(url);
				});

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
		type: "object",
		selector: "> .video .mediaAnalytics",
		optional: true
	}

};

var defaultContent = {
	accessControl: "Public",
	accessControlEntities: [],
	categoryIds: [],
	commentsEnabled: true,
	description: "",
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

var Content = (function (_ModelBase) {
	function Content(data) {
		_classCallCheck(this, Content);

		_get(Object.getPrototypeOf(Content.prototype), "constructor", this).call(this, data);
	}

	_inherits(Content, _ModelBase);

	_createClass(Content, {
		hasInstances: {
			// sorts the available instances and gets the best quality one
			// only local is default -- only gets instances that have file in backup

			value: function hasInstances() {
				return !_.isEmpty(this.vendorInstances);
			}
		},
		getBestInstance: {
			value: function getBestInstance() {
				var onlyLocal = arguments[0] === undefined ? true : arguments[0];

				var whereFn = onlyLocal ? _.property("relativeFilePath") : _.noop;

				return _(this.vendorInstances).where(whereFn).sortByAll(["size", "bitrate", "width", "height"]).last();
			}
		},
		getInstanceAtWidth: {
			value: function getInstanceAtWidth(width) {
				var onlyLocal = arguments[1] === undefined ? true : arguments[1];

				var whereFn = onlyLocal ? _.property("relativeFilePath") : _.noop;
				return _(this.vendorInstances).where(whereFn).sortBy(function (instance) {
					return Math.abs(width - instance.width);
				}).first();
			}
		}
	}, {
		"default": {
			get: function () {
				return defaultContent;
			}
		},
		className: {
			get: function () {
				return "Content";
			}
		},
		vendorType: {
			get: function () {
				return "vpcontent";
			}
		},
		revType: {
			get: function () {
				return "video";
			}
		},
		schema: {
			get: function () {
				return schema;
			}
		}
	});

	return Content;
})(ModelBase);

Content.register();

module.exports = Content;

/*revTransform: function (teams) {
  return _.map(_.bubble(teams), (team) => team.toRevData.call(team));
}*/
//# sourceMappingURL=Content.js.map