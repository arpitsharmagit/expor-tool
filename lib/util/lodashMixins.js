'use babel';
'use strict';

var _ = require('lodash');


var mixinFunctions = function (lo) {
  if (lo && lo.mixin) {
    _ = lo;
    return lo.mixin.call(lo, this);
  } else {
    return _.mixin.call(_, this).mixin.call(_, lo);
  }
};

mixinFunctions.bubble = function (value) {
  return [].concat(value);
};
mixinFunctions.unbubble = function (value) {
  return (_.isArray(value) && value.length === 1) ? value[0] : value;
};

mixinFunctions.uuid = function () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

mixinFunctions.atob = function (str) {
  return new Buffer(str, 'base64').toString('binary');
};

mixinFunctions.btoa = function (str) {
  return new Buffer(str, 'binary').toString('base64');
};

module.exports = mixinFunctions;
