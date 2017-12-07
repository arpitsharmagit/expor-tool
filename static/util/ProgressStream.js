"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var stream = require("stream"),
    speedometer = require("speedometer"),
    _ = require("lodash");

var ProgressStream = (function (_stream$Transform) {
  function ProgressStream() {
    var _this = this;

    var options = arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, ProgressStream);

    _get(Object.getPrototypeOf(ProgressStream.prototype), "constructor", this).call(this, options);

    this.settings = _.defaults({}, options, this.defaults);
    this.speed = speedometer(this.settings.speedWindow);
    this.startTime = Date.now();

    var stats = {
      percentage: 0,
      transferred: this.settings.transferred,
      length: this.settings.length,
      remaining: this.settings.length,
      eta: 0,
      runtime: 0
    };

    this._update = this._update.bind(this, stats, this.settings.objectMode);
    var immediateUpdateStats = this.updateStats.bind(this, stats);
    this.updateStats = _.throttle(immediateUpdateStats, this.settings.interval);

    // on end immediately send progress event, and cancel pending
    this.on("end", function () {
      _this.updateStats.cancel();
      immediateUpdateStats(true);
    });

    this.on("pipe", function (src) {

      _.each(src, function (val, key) {
        if (_.isString(val) || _.isNumber(val) && !(key in _this)) {
          _this[key] = val;
        }
      });

      if (_.isNumber(src.length)) {
        _this.length = src.length;
      } else if (_.isObject(src.headers) && !isNaN(src.headers["content-length"])) {
        _this.lenth = parseInt(src.headers["content-length"]);
      }

      src.on("response", function (res) {
        if (!res || !res.headers) {
          return;
        }
        if (res.headers["content-encoding"] === "gzip") {
          return;
        }
        if (res.headers["content-length"]) {
          _this.length = parseInt(res.headers["content-length"]);
        }
      });
    });

    Object.defineProperty(this, "length", {
      get: function () {
        return _this.settings.length;
      },
      set: function (val) {
        _this.settings.length = val;
        stats.length = val;
        _this.emit("length", val);
      },
      enumerable: true
    });
  }

  _inherits(ProgressStream, _stream$Transform);

  _createClass(ProgressStream, {
    updateStats: {
      value: function updateStats(stats, ended) {

        stats.percentage = ended ? 100 : stats.length ? stats.transferred / stats.length * 100 : 0;
        stats.speed = this.speed(0);
        stats.eta = Math.round(stats.remaining / stats.speed);
        stats.runtime = parseInt((Date.now() - this.startTime) / 1000);
        this.emit("progress", stats);
      }
    },
    _update: {
      value: function _update(stats, objectMode, data) {
        var len = objectMode ? 1 : data.length,
            transferred = stats.transferred += len;
        stats.transferred = transferred;
        stats.remaining = stats.length >= transferred ? stats.length - transferred : 0;
        this.speed(len);

        this.updateStats(false);
      }
    },
    _transform: {
      value: function _transform(data, encoding, callback) {

        this._update(data);

        this.push(data);
        callback();
      }
    },
    _flush: {
      value: function _flush(callback) {
        this.updateStats(true);

        callback();
      }
    },
    defaults: {
      get: function () {
        return {
          interval: 1000,
          length: 0,
          transferred: 0,
          speedWindow: 5000
        };
      }
    }
  });

  return ProgressStream;
})(stream.Transform);

module.exports = ProgressStream;
//# sourceMappingURL=ProgressStream.js.map