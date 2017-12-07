'use babel';
'use strict';

var ModelBase = require('./ModelBase'),
    TimeUtil = require('../util/TimeUtil'),
    helpers, schema;


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
  commentId: {
    revKey: 'commentId'
  },
  ciscoCommentId: {
    type: 'string',
    selector: '> .commentId'
  },
  videoId: {
    type: 'string',
    revKey: 'videoId'
  },
  text: {
    required: true,
    type: 'string',
    selector: '> .commentText',
    revTransform: function (value) {
      let when = (new Date(this.when)).toDateString(),
          timeline = (this.time) ? `[${this.time})] ` : '';
      return `${timeline}On ${when} ${this.username} wrote:\n${this.text}`;
    },
    revKey: 'text'
  },
  username: {
    required: true,
    type: 'string',
    selector: '> .vpuser .username',
    association: {
			hasMany: false,
			model: 'User',
			key: 'username'
		},
    revKey: 'username'
  },
  when: {
		type: 'datetime',
		selector: '> .createdTs .date',
		transform: function (val) {
			return new Date(parseInt(val, 10));
		},
		revKey: 'when'
	},
  flagCount: {
    type: 'int',
    transform: helpers.toInteger,
    selector: '> .flagCount',
    optional: true
  },
  ipAddress: {
    selector: '> .ipAddress',
    optional: true
  },
  time: {
    type: 'string',
    selector: '> .time_index',
    transform: function (value) {
      var val = parseInt(value, 10) * 1000;
      return TimeUtil.formatTimespan(val);
    },
    optional: true
  }
};

class Comment extends ModelBase {
  constructor (data) {
    super(data);

  }

  get isTimelineComment () {
    return !!this.time;
  }

  static get className () {
    return 'Comment';
  }
  static get vendorType () {
    return ['vpbasicComment','vpinlineComment'];
  }
  static get revType () {
    return 'comment';
  }
  static get schema () {
    return schema;
  }
}

// register model type with ModelBase registry
Comment.register();

module.exports = Comment;
