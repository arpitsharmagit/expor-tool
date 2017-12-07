'use babel';
'use babel';
'use strict';

var _ = require('lodash');

function init () {
  let storage = {
    config: {}
  };

  Object.defineProperties(storage, {
    get: {
      value: _.get.bind(_, storage),
      enumerable: false
    },
    has: {
      value: _.has.bind(_, storage),
      enumerable: false
    },
    set: {
      value: _.set.bind(_, storage),
      enumerable: false
    },
    destroy: {
      value: () => {
        delete global.__globalStore;
        global.__globalStore = init();
      }
    }
  });

  return storage;
}

if (!_.isObject(global.__globalStore)) {
  global.__globalStore = init();
}

module.exports = global.__globalStore;
