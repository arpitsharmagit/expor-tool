"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var ModelBase = require("./ModelBase"),
    helpers,
    schema;

helpers = {
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
    require: true,
    selector: "> .id",
    transform: helpers.toInteger
  },
  name: {
    selector: "> .name",
    revKey: "name"
  },
  collectionId: {
    revKey: "collectionId"
  },
  groups: {
    revKey: "groupIds"
  },
  users: {
    revKey: "userIds"
  },
  description: {
    selector: "> .description",
    revKey: "description"
  },
  parentGroupId: {
    selector: "> .parentGroupId",
    transform: helpers.toInteger
  },
  userCount: {
    selector: "> .userCount",
    transform: helpers.toInteger
  },
  isShareable: {
    selector: "> .isShareable",
    transform: helpers.testEqualTo("true")
  },
  createdBy: {
    selector: "> .createdBy"
  }
};

// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?

var UserGroup = (function (_ModelBase) {
  function UserGroup(data) {
    _classCallCheck(this, UserGroup);

    _get(Object.getPrototypeOf(UserGroup.prototype), "constructor", this).call(this, data);
  }

  _inherits(UserGroup, _ModelBase);

  _createClass(UserGroup, null, {
    className: {
      get: function () {
        return "UserGroup";
      }
    },
    vendorType: {
      get: function () {
        return ["vpusergroup", "usergroup"];
      }
    },
    revType: {
      get: function () {
        return "collection";
      }
    },
    schema: {
      get: function () {
        return schema;
      }
    }
  });

  return UserGroup;
})(ModelBase);

UserGroup.register();

module.exports = UserGroup;
//# sourceMappingURL=UserGroup.js.map