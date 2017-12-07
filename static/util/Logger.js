"use strict";

"use babel";
"use strict";

var isBrowser = typeof window !== "undefined",
    fs,
    _ = require("lodash"),
    util = !isBrowser && require("util"),
    _private = require("./private-store"),
    slice = Array.prototype.slice;

var DEFAULT_LOG_LEVEL = 3; // logger.info

try {
  // in case browser but not atom-shell
  fs = require("fs");
} catch (err) {}

var Logger = (function (_Logger) {
  var _LoggerWrapper = function Logger(_x, _x2) {
    return _Logger.apply(this, arguments);
  };

  _LoggerWrapper.toString = function () {
    return _Logger.toString();
  };

  return _LoggerWrapper;
})(function (options, filename) {
  var self = this,
      logName = _.isObject(options) ? options.name || options.logName : options,
      name = logName || "log";

  options = _.defaults({}, options, {
    name: name,
    destination: "console", // could also be 'file'
    filepath: undefined, // set to save to file
    severity: Logger.LOG_LEVEL,
    color: undefined,
    backgroundColor: undefined
  });

  this.name = name;

  this.filename = filename;

  this.level = options.severity;

  registerLogger(this);

  if (isBrowser) {
    this.labelCSS = "font-family: sans-serif; font-weight: bold;";
    if (options.color || options.backgroundColor) {
      if (options.color) {
        this.labelCSS += "color: " + options.color;
      }
      if (options.backgroundColor) {
        this.labelCSS += "background-color: " + options.color;
      }
    } else {
      this.labelCSS += randomHSLCSS();
    }
  } else {
    this.labelColor = "";
  }

  // so you can set global verbosity level for specific names
  //if (!(name in loggers) && !isNaN(level)) {
  //  loggers[name] = parseInt(level, 10);
  //}

  this.writeBrowser = function (severity) {
    var time = new Date().toISOString().replace(/.*T\d\d:(.*)Z/, "$1"),
        spec = self.levelMap[severity || "log"],
        timeCSS = "color:#999",
        specCSS = spec.css,
        labelCSS = self.labelCSS,
        CSSspecifier = "%c",
        args = ["" + CSSspecifier + "%s " + CSSspecifier + " %s " + CSSspecifier + " %s ", timeCSS, time, specCSS, spec.title, labelCSS, self.name + " "].concat(slice.call(arguments, 1)),
        level = self.getLevel(),
        consoleFn = spec.f || console.log;

    if (Logger.onWrite && _.isFunction(Logger.onWrite) && level >= Logger.LOG_LEVEL) {
      var message = {
        severity: severity,
        time: time,
        domain: self.name,
        data: slice.call(arguments, 1)
      };
      Logger.onWrite(message);
    }

    if (level >= spec.severity && level >= Logger.LOG_LEVEL) {
      consoleFn.apply(console, args);
    }
  };

  this.writeConsole = function (severity) {
    var now = new Date().toISOString().replace(/.*T\d\d:(.*)Z/, "$1"),
        spec = self.levelMap[severity || "log"],
        time = now,
        title = spec.title,
        label = self.name,
        inspectedArgs = util.inspect(slice.call(arguments, 1), { depth: 1, colors: true }),
        args = [time, title, label].concat(inspectedArgs),
        level = self.getLevel(),
        consoleFn = spec.f || console.log;

    if (Logger.onWrite && _.isFunction(Logger.onWrite) && level >= Logger.LOG_LEVEL) {
      var message = {
        severity: severity,
        time: time,
        domain: self.name,
        data: slice.call(arguments, 1)
      };
      Logger.onWrite(message);
    }

    if (level >= spec.severity && level >= Logger.LOG_LEVEL) {
      consoleFn.apply(console, args);
    }
  };

  this.writeFile = function (severity) {
    var now = new Date(),
        spec = self.levelMap[severity || "log"],
        obj = {
      time: now,
      severity: spec.title.trim(),
      source: self.name,
      data: slice.call(arguments, 1)
    },
        str,
        level = self.getLevel();

    return new Promise(function (resolve, reject) {

      if (level >= spec.severity) {
        try {
          str = JSON.stringify(obj);
        } catch (err) {
          str = ["\"", now, spec.title, self.name, "invalid object", err, "\""].join("\t");
        }
        str += "\n";
        fs.appendFile(self.filepath, str, function (err) {
          if (err) {
            reject("unable to write to logfile", self.filepath, err);
          } else {
            resolve();
          }
        });
      }
    });
  };

  if (options.destination === "file") {
    if (!options.filepath) {
      throw new Error("logger error, must specify filepath if writing to disk");
    }

    this.filepath = options.filepath;

    if (!fs) {
      throw new Error("unable to initialize fs module, cannot write to file");
    }

    this.write = this.writeFile;
  } else if (isBrowser) {
    this.write = this.writeBrowser;
  } else {
    this.write = this.writeConsole;
  }

  this.getLevel = function () {
    return self.level != null ? self.level : Logger.LOG_LEVEL;
  };

  this.setLevel = function (level) {
    if (_.isString(level)) {
      level = self.levelMap[level].severity;
    } else {
      level = parseInt(level, 10);
    }
    self.level = level;
  };

  this.quiet = function () {
    this.setLevel(Logger.NONE);
  };

  this.loud = function () {
    this.setLevel(Logger.ALL);
  };

  // actually creates functions (log.log, log.debug, etc)
  Object.keys(this.levelMap).forEach(function (levelName) {
    self[levelName] = self.write.bind(self, levelName);
  });

  this.cache = Logger.cache.bind(this);
});

Logger.NONE = 0;
Logger.ERROR = 1;
Logger.WARN = 2;
Logger.INFO = 3;
Logger.LOG = 4;
Logger.DEBUG = 5;
Logger.ALL = 10;

function registerLogger(instance) {
  var context = _private(Logger);
  if (!context.loggers) {
    context.loggers = new Set();
  }
  _private(Logger).loggers.add(instance);

  if (typeof global !== "undefined" && global.LOG_REGISTRY instanceof Set) {
    global.LOG_REGISTRY.add(instance);
  }
}

function getLoggerByName(name) {
  var result = eachLogger(function (l) {
    return l.name === name && l;
  });
  return result[0];
}

function eachLogger(fn) {
  fn = fn || function (l) {
    return l;
  };
  var context = _private(Logger);
  var result = [];
  if (context.loggers) {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = context.loggers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var l = _step.value;

        var val = fn(l);
        if (val) {
          result.push(val);
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
  }

  if (typeof global !== "undefined" && global.LOG_REGISTRY instanceof Set) {
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = global.LOG_REGISTRY[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var l = _step2.value;

        var val = fn(l);
        if (val) {
          result.push(val);
        }
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2["return"]) {
          _iterator2["return"]();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }
  }

  return result;
}

function getGlobalLogLevel() {
  var context = typeof global !== "undefined" && global.LOG_LEVEL ? global : typeof window !== "undefined" && window.LOG_LEVEL ? window : { LOG_LEVEL: DEFAULT_LOG_LEVEL };

  if (!isNaN(context.LOG_LEVEL)) {
    return parseInt(context.LOG_LEVEL);
  } else {
    return DEFAULT_LOG_LEVEL;
  }
}

Object.defineProperty(Logger, "LOG_LEVEL", {
  get: getGlobalLogLevel,
  set: function (val) {
    !isNaN(val) && (DEFAULT_LOG_LEVEL = parseInt(val, 10));
    return DEFAULT_LOG_LEVEL;
  }
});

var levelMap = Logger.prototype.levelMap = {
  debug: {
    severity: Logger.DEBUG,
    title: "DEBUG   ",
    fn: console.log,
    css: "font-weight: bold; background-color: green; color: white",
    ansi: "green+black_bg"
  },
  info: {
    severity: Logger.INFO,
    title: "INFO    ",
    fn: console.info,
    css: "font-weight: bold; background-color: #333; color: #ccc",
    ansi: "cyan+black_bg+bold"
  },
  warn: {
    severity: Logger.WARN,
    title: "WARN    ",
    fn: console.warn,
    css: "font-weight: bold; background-color: orange; color: purple",
    ansi: "yellow+black_bg+bold"
  },
  error: {
    severity: Logger.ERROR,
    title: "ERR ",
    fn: console.error,
    css: "font-weight: bold; background-color: red; color: white",
    ansi: "red+black_bg+bold"
  },
  log: {
    severity: Logger.LOG,
    title: "        ",
    fn: console.log,
    css: "font-weight: bold; background-color: white; color: black",
    ansi: "black+white_bg"
  }
};

Logger.verbosity = function (logLevel, logName, force) {
  var level = parseInt(logLevel, 10) || levelMap[logLevel];

  if (isNaN(logLevel)) return Logger.LOG_LEVEL;

  if (logName || force) {
    eachLogger(function (log) {
      if (!logName || log.name === logName) {
        log.level = level;
      }
    });
  } else {
    Logger.LOG_LEVEL = level;
  }
};

Logger.quietAll = function (logName) {
  Logger.verbosity(Logger.NONE, logName, true);
};

Logger.loudAll = function (logName) {
  Logger.verbosity(Logger.ALL, logName, true);
};

Logger.getLogLevels = function () {
  return eachLogger();
};

Logger.cache = function (saveLabel, logLevel) {
  var self = this instanceof Logger ? this : Logger;

  saveLabel || (saveLabel = "temp");
  logLevel || (logLevel = "log");
  return function (result) {
    var args = Array.prototype.slice.apply(arguments),
        logFunction = self instanceof Logger && self[logLevel] ? self[logLevel].bind(self) : typeof log !== "undefined" && log.hasOwnProperty(logLevel) ? log[logLevel].bind(log) : logLevel in console ? console[logLevel].bind(console) : undefined;

    if (logFunction) {
      logFunction.apply(undefined, ["cached as " + saveLabel].concat(args));
    } else {
      console.log("cached as " + saveLabel);
    }

    if (args.length === 1) {
      self.cache[saveLabel] = args[0];
    } else if (args.length === 2 && args[0] == undefined) {
      self.cache[saveLabel] = args[1];
    } else {
      self.cache[saveLabel] = args;
    }
  };
};

Logger.readLogFile = function (filepath, callback) {
  callback = callback || console.log.bind(console);

  if (!fs) {
    throw new Error("fs module not loaded");
  }

  fs.readFile(filepath, "utf8", function (err, raw) {
    if (err) {
      return callback(err);
    }

    var str = "[" + str.split("\n").join(",") + "]";

    try {
      callback(null, JSON.parse(str));
    } catch (err) {
      callback(err);
    }
  });
};

function randomHSLCSS() {
  var hue = Math.floor(Math.random() * 360),
      sat = Math.floor(Math.random() * 30) + 70,
      lumOffset = Math.random() > 0.5 ? 75 : 10,
      lum = Math.floor(Math.random() * 20) + lumOffset,
      bghue = (hue + 180) % 360,
      bglum = 100 - lum,
      bgsat = bglum > 50 ? sat * 0.5 : sat;

  return "background-color: hsl(" + bghue + "," + bgsat + "%," + bglum + "%); color: hsl(" + hue + "," + sat + "%," + lum + "%)";
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb(h, s, l) {
  var r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    var hue2rgb = function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }if (t < 1 / 2) {
        return q;
      }if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }return p;
    };

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

module.exports = Logger;

/*

Logger = require('./Logger')
log = new Logger();

log = new Logger({
  name: 'testwrite',
  destination: 'file',
  filepath: './test.log'
});
// can check if complete using promise
p = log.info('hello world')

*/
//# sourceMappingURL=Logger.js.map