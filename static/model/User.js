"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var ModelBase = require("./ModelBase");

var schema = {
  username: {
    required: true,
    selector: "> .username",
    revKey: "username"
  },
  firstname: {
    selector: "> .firstname",
    revKey: "firstName"
  },
  lastname: {
    selector: "> .lastname",
    revKey: "lastName"
  },
  email: {
    required: true,
    selector: "> .useremail",
    revKey: "email"
  },
  company: {
    selector: "> .usercompany"
  },
  title: {
    revKey: "title"
  },
  phone: {
    selector: "> .userphone",
    revKey: "phone"
  },
  language: {
    selector: "> .userlocale",
    revKey: "language",
    transform: function transform(value) {
      // TODO language/locale tranform not implemented
      return value;
    }
  },
  ciscoUserID: {
    required: true,
    selector: "> .userid"
  },
  ciscoRoles: {
    type: "object",
    selector: "> .assignedRoles > object > .roleDef"
  },
  userId: {
    revKey: "id"
  },
  inboxId: {
    revKey: "inboxId"
  },
  roles: {
    revKey: "roleIds"
  }
};

// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?

var User = (function (_ModelBase) {
  function User(data) {
    _classCallCheck(this, User);

    _get(Object.getPrototypeOf(User.prototype), "constructor", this).call(this, data);
  }

  _inherits(User, _ModelBase);

  _createClass(User, null, {
    className: {
      get: function () {
        return "User";
      }
    },
    vendorType: {
      get: function () {
        return "vpuser";
      }
    },
    revType: {
      get: function () {
        return "user";
      }
    },
    schema: {
      get: function () {
        return schema;
      }
    }
  });

  return User;
})(ModelBase);

// register model type with ModelBase registry
User.register();

module.exports = User;
//# sourceMappingURL=User.js.map