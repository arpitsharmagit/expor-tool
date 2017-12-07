"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var ModelBase = require("./ModelBase"),
    TimeUtil = require("../util/TimeUtil"),
    helpers,
    schema;

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
  commentId: {
    revKey: "commentId"
  },
  ciscoCommentId: {
    type: "string",
    selector: "> .commentId"
  },
  videoId: {
    type: "string",
    revKey: "videoId"
  },
  text: {
    required: true,
    type: "string",
    selector: "> .commentText",
    revTransform: function revTransform(value) {
      var when = new Date(this.when).toDateString(),
          timeline = this.time ? "[" + this.time + ")] " : "";
      return "" + timeline + "On " + when + " " + this.username + " wrote:\n" + this.text;
    },
    revKey: "text"
  },
  username: {
    required: true,
    type: "string",
    selector: "> .vpuser .username",
    association: {
      hasMany: false,
      model: "User",
      key: "username"
    },
    revKey: "username"
  },
  when: {
    type: "datetime",
    selector: "> .createdTs .date",
    transform: function transform(val) {
      return new Date(parseInt(val, 10));
    },
    revKey: "when"
  },
  flagCount: {
    type: "int",
    transform: helpers.toInteger,
    selector: "> .flagCount",
    optional: true
  },
  ipAddress: {
    selector: "> .ipAddress",
    optional: true
  },
  time: {
    type: "string",
    selector: "> .time_index",
    transform: function transform(value) {
      var val = parseInt(value, 10) * 1000;
      return TimeUtil.formatTimespan(val);
    },
    optional: true
  }
};

var Comment = (function (_ModelBase) {
  function Comment(data) {
    _classCallCheck(this, Comment);

    _get(Object.getPrototypeOf(Comment.prototype), "constructor", this).call(this, data);
  }

  _inherits(Comment, _ModelBase);

  _createClass(Comment, {
    isTimelineComment: {
      get: function () {
        return !!this.time;
      }
    }
  }, {
    className: {
      get: function () {
        return "Comment";
      }
    },
    vendorType: {
      get: function () {
        return ["vpbasicComment", "vpinlineComment"];
      }
    },
    revType: {
      get: function () {
        return "comment";
      }
    },
    schema: {
      get: function () {
        return schema;
      }
    }
  });

  return Comment;
})(ModelBase);

// register model type with ModelBase registry
Comment.register();

module.exports = Comment;
//# sourceMappingURL=Comment.js.map