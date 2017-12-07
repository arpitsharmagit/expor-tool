"use strict";

"use babel";
"use babel";
"use strict";

var _ = require("lodash");

function init() {
  var storage = {
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
      value: function () {
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
//# sourceMappingURL=global-store.js.map