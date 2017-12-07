"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var ModelBase = require("./ModelBase");

var ROOT_PATH = "/dms/core/contentcatalog/vportal/1";
var ROOT_PATH_REGEX = new RegExp(ROOT_PATH + "/?$");

var schema = {
  name: {
    require: true,
    selector: "> .name",
    revKey: "name"
  },
  categoryId: {
    revKey: "categoryId"
  },
  parentCategoryId: {
    revKey: "parentCategoryId"
  },
  path: {
    selector: "> .path",
    revKey: "fullPath",
    revTransform: function revTransform(value) {
      return (value || "").replace(ROOT_PATH + "/", "");
    }
  },
  parentpath: {
    selector: "> .parentpath",
    optional: true
  },
  ciscoCategoryId: {
    selector: "> .categoryid",
    optional: true
  },
  children: {
    __model: "Category",
    optional: true,
    type: "object",
    associationType: "hasMany",
    name: "Children",
    selector: "> .child",
    transform: function transform(value) {
      var ThisClass = this;
      if (!Array.isArray(value)) {
        value = [value];
      }

      return value.map(ThisClass.fromVendorObject.bind(this));
    }
  }
};

// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?

var Category = (function (_ModelBase) {
  function Category(data) {
    _classCallCheck(this, Category);

    _get(Object.getPrototypeOf(Category.prototype), "constructor", this).call(this, data);
  }

  _inherits(Category, _ModelBase);

  _createClass(Category, {
    flatten: {

      // categories are returned nested from Cisco, so this gets them as flat array

      value: function flatten() {
        var result = [this];

        if (this.children) {
          var flatChildren = this.children.reduce(function (aggregate, child) {
            return [].concat(aggregate, child.flatten.call(child));
          });
          result = result.concat(flatChildren);
        }

        return result;
      }
    },
    isRootCategory: {
      // root category has no parent

      get: function () {
        return Category.isRootCategoryCheck(this.path);
      }
    }
  }, {
    isRootCategoryCheck: {
      // root will only have slash at end

      value: function isRootCategoryCheck(path) {
        return ROOT_PATH_REGEX.test(path);
      }
    },
    className: {
      get: function () {
        return "Category";
      }
    },
    vendorType: {
      get: function () {
        return "vpcategory";
      }
    },
    revType: {
      get: function () {
        return "category";
      }
    },
    schema: {
      get: function () {
        return schema;
      }
    }
  });

  return Category;
})(ModelBase);

Category.register();

module.exports = Category;

/*
  c = new Category({name: 'parent'});
  d = new Category({name: 'child'});
  c.datastore.save(log.log);
  c.datastore.addChild(d.datastore);

  c.datastore.save(log.log)

  c.datastore.getChildren(log.log)

*/
//# sourceMappingURL=Category.js.map