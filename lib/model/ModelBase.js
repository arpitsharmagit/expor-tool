'use babel';
'use strict';

var _ = require('lodash'),
    $js = require('JSONSelect'),
    Logger = require('../util/Logger'),
    log = new Logger('migrate-model'),
    modelRegistry = new Map(),
    registry = {
      by: {
        vendorType: new Map(),
        revType: new Map()
      },
      models: modelRegistry
    };
_.mixin(require('../util/lodashMixins'));

log.setLevel(Logger.INFO);

// TODO: should data be stored in this.properties or in this.datastore?

class ModelBase {
  constructor (data) {
    var self = this;
        //ThisClass = this.constructor;

    if (_.isObject(data)) {

      let schema = this.schema,
          keys = _.keys(schema),
          properties = _.pick(data, keys);

      //this.datastore = DataStoreModel.create(properties);
      _.each(properties, (value, key) => {
        self[key] = value;
      });

    }

  }
  static register() {
    var key = this.className;
    if (modelRegistry.has(key)) {
      log.debug('model has already been registered: ' + key);
      return this;
    }
    modelRegistry.set(key, this);
    let vendorType = _.bubble(this.vendorType);
    for (let type of vendorType) {
      registry.by.vendorType.set(type, this);
    }
    registry.by.revType.set(this.revType, this);
    log.debug(`registered model ${vendorType.join(",")}`);
    return this;
  }
  static getModelForVendorType (obj) {
    var matches = [];

    for (let [vendorType, ModelClass] of registry.by.vendorType) {
      if (vendorType in obj) {
        matches.push(ModelClass);
      }
    }

    if (matches.length > 1) {
      log.warn('multiple class matches for vendor object', obj, matches);
    }
    return matches[0];
  }
  static getModelByClassName (name) {
    return modelRegistry.get(name);
  }
  static get registry () {
    return registry;
  }
  toJSON () {
    let keys = _.keys(this.schema);
    let result = _.clone(_.pick(this, keys), (value) => {
      if (_.isArray(value) && value[0] instanceof ModelBase) {
        return _.invoke(value, 'toJSON');

      } else if (value instanceof ModelBase) {
        return value.toJSON.call(value);

      } else {
        return undefined; // let lodash handle
      }
    });
    result.__model = this.__model;
    return result;
  }
  toString () {
    //return this.datastore.toString();
    return JSON.stringify(this.toJSON());
  }
  toRevData () {
    let revSchema = _.pick(this.schema, (v) => v.revKey),
        result = {};

    _.each(revSchema, (spec, key) => {
      let value = this[key];
      if (spec.revTransform) {
        value = spec.revTransform.call(this, value);
      } else if (_.isArray(value) && value[0] instanceof ModelBase) {
        value = _.invoke(value, 'toRevData');
      } else if (value instanceof ModelBase) {
        value = value.toRevData.call(value);
      }

      if (!_.isUndefined(value)) {
        result[spec.revKey] = value;
      }
    });
    return result;
  }
  get schema () {
    return this.constructor.schema;
  }
  get __model () {
    return this.constructor.className;
  }
  static get className () {
    log.warn('subclass must implement className');
    return this.name;
  }
  static get vendorType () {
    log.warn('subclass must implement selector');
  }
  static get revType () {
    return 'modelbase';
  }
  static get dbType () {
    return 'base';
  }
  static get schema () {
    log.warn('superclass called for schema, should be subclass');
  }

  // goes through the defined schema, finds the necessary values for each defined property, transforming as necessary.  Input should be cisco object, not cisco request (i.e. if vpuser: data just send in data)
  /*
  static fromDataStore (data) {
    // constructor handles translating
    var ThisClass = this;
    return new ThisClass(data);
  }
  */
  static fromVendorObject (data) {
    // this in context refers to class constructor
    var ThisClass = this,
        schema = this.schema,
        $ = $js.match.bind($js),
        classSelectors = _.bubble(this.vendorType).map((type) => ':root > .' + type),
        result = {};


    // first, test if this a root that contains this class, or if it's the class data itself
    let classMatches = _.flatten(classSelectors.map( (selector) => $(selector, data)));
    if (classMatches.length) {
      // will always return a single result, which may or may not be an array -- make flat array
      classMatches = _.bubble(_.unbubble(classMatches));
      result = classMatches.map(this.fromVendorObject.bind(this));

      // unbubble single result
      return _.unbubble(result);
    }
    /***************/

    for(let key in schema) {
      let spec = schema[key],
          value;
      // selector tells us the cisco object has this value
      if (!spec.selector) { continue; }

      // uses JSON schema to find data in input
      let selector = ':root ' + spec.selector,
          matches = $(selector, data);

      if (!matches.length) {
        if (!spec.optional) {
          log.debug('nomatch', key, spec, data);
        }
        continue;
      }

      // unbubble single results
      value = _.unbubble(matches);

      if (value === '') {
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

  static fromRev (data) {
    // this in context refers to class constructor
    var ThisClass = this,
        schema = this.schema,
        result = {};

    if (_.isArray(data)) {
      result = data.map(this.fromRev.bind(this));
      //return _.unbubble(result);
      return result;
    }

    _.each(schema, (spec, modelKey) => {
      if (spec.revKey && (spec.revKey in data)) {
        let val = data[spec.revKey];
        if (spec.__model) {
          let SpecClass = ModelBase.getModelByClassName(spec.__model);
          result[modelKey] = SpecClass.fromRev(val);
        } else {
          result[modelKey] = val;
        }
      }
    });

    return new ThisClass(result);
  }

  static fromJSON (data) {
    // this in context refers to class constructor
    var ThisClass = this,
        schema = this.schema,
        result = {};

    if (_.isArray(data)) {
      result = data.map(this.fromJSON.bind(this));
      //return _.unbubble(result);
      return result;
    }

    _.each(data, (value, key) => {
      let spec = schema[key];

      if (!spec) { return; }

      // transform to Model
      if (spec.__model) {
        let SpecClass = ModelBase.getModelByClassName(spec.__model);
        result[key] = SpecClass.fromJSON(value);
      } else {
        result[key] = value;
      }

    });

    return new ThisClass(result);

  }

}

module.exports = ModelBase;
