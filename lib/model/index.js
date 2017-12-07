'use babel';
'use strict';


var _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    ModelBase = require('./ModelBase'),
    Logger = require('../util/Logger'),
    log = new Logger('model-index'),
    hooks = {
      beforeParseVendorObject: null,
      afterParseVendorObject: function (obj, ModelClass) {
        // remove array of categories instead of nested
        if (ModelClass.name === 'Category') {
          return _.unbubble(obj.flatten());
        } else {
          return obj;
        }
      }
    };

  _.mixin(require('../util/lodashMixins'));

  function loadModelClasses () {
    // require all model classes in directory
    var modelClasses = {},
        skipFiles = new Set(['index.js', 'ModelBase.js']),
        files = fs.readdirSync(__dirname);

    for (let file of files) {

      // only load model class files
      if (skipFiles.has(file)) { continue; }

      let filepath = path.resolve(__dirname, file);
      let ModelClass = require(filepath);

      if (!ModelClass.className) {
        log.log('not model class', file);
        continue;
      }
      modelClasses[ModelClass.className] = ModelClass;
    }

    return modelClasses;
  }

function fromVendorObject (obj) {
  var ModelClass = ModelBase.getModelForVendorType(obj);

  if (!ModelClass) {
    throw new Error('Unknown vendor type: ' + _.keys(obj).join(','));
  }

  if (hooks.beforeParseVendorObject) {
    obj = hooks.beforeParseVendorObject(obj, ModelClass);
  }

  let result = ModelClass.fromVendorObject(obj);

  if (hooks.afterParseVendorObject) {
    result = hooks.afterParseVendorObject(result, ModelClass);
  }
  return result;

}
function fromPlainObject(obj, className) {
  var ModelClass = ModelBase.getModelByClassName(className || obj.__model);
  return ModelClass.fromJSON(obj);
}
function fromRev(obj, className) {

}
// default is to assume vendor?
function model (input) {
  if (_.isArray(input)) {
    return _.map(input, model);
  }
  if (input.__model) {
    return fromPlainObject(input);
  }

  return fromVendorObject(input);
}

let loadedModelClasses = loadModelClasses();
_.extend(model, {
  fromVendor: fromVendorObject,
  fromJSON: fromPlainObject,
  fromRev: fromRev,
  ModelBase: ModelBase
}, loadedModelClasses);

module.exports = model;
