"use strict";

var _slicedToArray = function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { var _arr = []; for (var _iterator = arr[Symbol.iterator](), _step; !(_step = _iterator.next()).done;) { _arr.push(_step.value); if (i && _arr.length === i) break; } return _arr; } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var _ = require("lodash"),
    $js = require("JSONSelect"),
    Logger = require("../util/Logger"),
    log = new Logger("migrate-model"),
    modelRegistry = new Map(),
    registry = {
  by: {
    vendorType: new Map(),
    revType: new Map()
  },
  models: modelRegistry
};
_.mixin(require("../util/lodashMixins"));

log.setLevel(Logger.INFO);

// TODO: should data be stored in this.properties or in this.datastore?

var ModelBase = (function () {
  function ModelBase(data) {
    _classCallCheck(this, ModelBase);

    var self = this;
    //ThisClass = this.constructor;

    if (_.isObject(data)) {

      var schema = this.schema,
          keys = _.keys(schema),
          properties = _.pick(data, keys);

      //this.datastore = DataStoreModel.create(properties);
      _.each(properties, function (value, key) {
        self[key] = value;
      });
    }
  }

  _createClass(ModelBase, {
    toJSON: {
      value: function toJSON() {
        var keys = _.keys(this.schema);
        var result = _.clone(_.pick(this, keys), function (value) {
          if (_.isArray(value) && value[0] instanceof ModelBase) {
            return _.invoke(value, "toJSON");
          } else if (value instanceof ModelBase) {
            return value.toJSON.call(value);
          } else {
            return undefined; // let lodash handle
          }
        });
        result.__model = this.__model;
        return result;
      }
    },
    toString: {
      value: function toString() {
        //return this.datastore.toString();
        return JSON.stringify(this.toJSON());
      }
    },
    toRevData: {
      value: function toRevData() {
        var _this = this;

        var revSchema = _.pick(this.schema, function (v) {
          return v.revKey;
        }),
            result = {};

        _.each(revSchema, function (spec, key) {
          var value = _this[key];
          if (spec.revTransform) {
            value = spec.revTransform.call(_this, value);
          } else if (_.isArray(value) && value[0] instanceof ModelBase) {
            value = _.invoke(value, "toRevData");
          } else if (value instanceof ModelBase) {
            value = value.toRevData.call(value);
          }

          if (!_.isUndefined(value)) {
            result[spec.revKey] = value;
          }
        });
        return result;
      }
    },
    schema: {
      get: function () {
        return this.constructor.schema;
      }
    },
    __model: {
      get: function () {
        return this.constructor.className;
      }
    }
  }, {
    register: {
      value: function register() {
        var key = this.className;
        if (modelRegistry.has(key)) {
          log.debug("model has already been registered: " + key);
          return this;
        }
        modelRegistry.set(key, this);
        var vendorType = _.bubble(this.vendorType);
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = vendorType[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var type = _step.value;

            registry.by.vendorType.set(type, this);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator["return"]) {
              _iterator["return"]();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        registry.by.revType.set(this.revType, this);
        log.debug("registered model " + vendorType.join(","));
        return this;
      }
    },
    getModelForVendorType: {
      value: function getModelForVendorType(obj) {
        var matches = [];

        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = registry.by.vendorType[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var _step$value = _slicedToArray(_step.value, 2);

            var vendorType = _step$value[0];
            var ModelClass = _step$value[1];

            if (vendorType in obj) {
              matches.push(ModelClass);
            }
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator["return"]) {
              _iterator["return"]();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        if (matches.length > 1) {
          log.warn("multiple class matches for vendor object", obj, matches);
        }
        return matches[0];
      }
    },
    getModelByClassName: {
      value: function getModelByClassName(name) {
        return modelRegistry.get(name);
      }
    },
    registry: {
      get: function () {
        return registry;
      }
    },
    className: {
      get: function () {
        log.warn("subclass must implement className");
        return this.name;
      }
    },
    vendorType: {
      get: function () {
        log.warn("subclass must implement selector");
      }
    },
    revType: {
      get: function () {
        return "modelbase";
      }
    },
    dbType: {
      get: function () {
        return "base";
      }
    },
    schema: {
      get: function () {
        log.warn("superclass called for schema, should be subclass");
      }
    },
    fromVendorObject: {

      // goes through the defined schema, finds the necessary values for each defined property, transforming as necessary.  Input should be cisco object, not cisco request (i.e. if vpuser: data just send in data)
      /*
      static fromDataStore (data) {
        // constructor handles translating
        var ThisClass = this;
        return new ThisClass(data);
      }
      */

      value: function fromVendorObject(data) {
        // this in context refers to class constructor
        var ThisClass = this,
            schema = this.schema,
            $ = $js.match.bind($js),
            classSelectors = _.bubble(this.vendorType).map(function (type) {
          return ":root > ." + type;
        }),
            result = {};

        // first, test if this a root that contains this class, or if it's the class data itself
        var classMatches = _.flatten(classSelectors.map(function (selector) {
          return $(selector, data);
        }));
        if (classMatches.length) {
          // will always return a single result, which may or may not be an array -- make flat array
          classMatches = _.bubble(_.unbubble(classMatches));
          result = classMatches.map(this.fromVendorObject.bind(this));

          // unbubble single result
          return _.unbubble(result);
        }
        /***************/

        for (var key in schema) {
          var spec = schema[key],
              value = undefined;
          // selector tells us the cisco object has this value
          if (!spec.selector) {
            continue;
          }

          // uses JSON schema to find data in input
          var selector = ":root " + spec.selector,
              matches = $(selector, data);

          if (!matches.length) {
            if (!spec.optional) {
              log.debug("nomatch", key, spec, data);
            }
            continue;
          }

          // unbubble single results
          value = _.unbubble(matches);

          if (value === "") {
            continue;
          }

          // optionally convert value
          if (spec.transform) {
            value = spec.transform.call(this, value);
          }

          result[key] = value;
        }

        // don't return for empty content
        if (!_.keys(result).length) {
          return undefined;
        }

        return new ThisClass(result);
      }
    },
    fromRev: {
      value: function fromRev(data) {
        // this in context refers to class constructor
        var ThisClass = this,
            schema = this.schema,
            result = {};

        if (_.isArray(data)) {
          result = data.map(this.fromRev.bind(this));
          //return _.unbubble(result);
          return result;
        }

        _.each(schema, function (spec, modelKey) {
          if (spec.revKey && spec.revKey in data) {
            var val = data[spec.revKey];
            if (spec.__model) {
              var SpecClass = ModelBase.getModelByClassName(spec.__model);
              result[modelKey] = SpecClass.fromRev(val);
            } else {
              result[modelKey] = val;
            }
          }
        });

        return new ThisClass(result);
      }
    },
    fromJSON: {
      value: function fromJSON(data) {
        // this in context refers to class constructor
        var ThisClass = this,
            schema = this.schema,
            result = {};

        if (_.isArray(data)) {
          result = data.map(this.fromJSON.bind(this));
          //return _.unbubble(result);
          return result;
        }

        _.each(data, function (value, key) {
          var spec = schema[key];

          if (!spec) {
            return;
          }

          // transform to Model
          if (spec.__model) {
            var SpecClass = ModelBase.getModelByClassName(spec.__model);
            result[key] = SpecClass.fromJSON(value);
          } else {
            result[key] = value;
          }
        });

        return new ThisClass(result);
      }
    }
  });

  return ModelBase;
})();

module.exports = ModelBase;
//# sourceMappingURL=ModelBase.js.map