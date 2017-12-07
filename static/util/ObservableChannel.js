"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";
// ipc event communication
// promises based
// want event name and id of request (incrementing)
// namespaced events would be pretty cool, may be able to use that for rev bit as well
// just make async responses have incremented ID as event name?

// this class allows for asyncronous message passing using promises
// it binds with any eventEmitter-type objects that subscribe to it

// TODO you never need more than one other emmitter.
// TODO just have config bind to a single observable
// TODO makes life a lot easier.  and just about remote procedure calls then

var Q = require("q"),
    _ = require("lodash"),
    Observable = require("./Observable");

var DEFAULT_TIMEOUT = 60 * 1000 * 15; // 15 min

var ObservableChannel = (function (_Observable) {
  function ObservableChannel() {
    var cfg = arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, ObservableChannel);

    _get(Object.getPrototypeOf(ObservableChannel.prototype), "constructor", this).call(this, cfg);
    this.timeout = cfg.timeout || DEFAULT_TIMEOUT;
    this.channel = cfg.channel || new Observable();
  }

  _inherits(ObservableChannel, _Observable);

  _createClass(ObservableChannel, {
    submit: {
      value: function submit(eventName) {
        var _this = this;

        for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }

        var messageId = _.uniqueId(),
            resolveEventName = "" + eventName + ":" + messageId + ":resolve",
            rejectEventName = "" + eventName + ":" + messageId + ":reject",
            deferred = Q.defer();

        this.channel.on(resolveEventName, deferred.resolve);
        this.channel.on(rejectEventName, deferred.reject);

        var promise = deferred.promise;

        if (this.timeout) {
          promise = promise.timeout(this.timeout);
        }

        promise = promise["finally"](function () {
          for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            args[_key2] = arguments[_key2];
          }

          _this.channel.off(resolveEventName, deferred.resolve);
          _this.channel.off(rejectEventName, deferred.reject);
          return;
        });

        // ensure asyncronous calls
        setTimeout(function () {
          _this.emit.apply(_this, ["submit", eventName, messageId].concat(args));
          var emitfn = _this.channel.send || _this.channel.emit;
          emitfn.apply(_this.channel, [eventName, messageId].concat(args));
        }, 0);

        return promise;
      }
    },
    route: {

      // any time an event is received then run callback
      // callback should return a promise

      value: function route(eventName) {
        var _this = this;

        var callback = arguments[1] === undefined ? _.noop : arguments[1];

        this.channel.on(eventName, function (messageId) {
          for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            args[_key - 1] = arguments[_key];
          }

          var resolveEventName = "" + eventName + ":" + messageId + ":resolve",
              rejectEventName = "" + eventName + ":" + messageId + ":reject",
              promise;

          try {
            promise = Q(callback.apply(_this.context, args));
          } catch (err) {
            promise = Q.reject(err);
          }
          if (_this.timeout) {
            promise = promise.timeout(_this.timeout);
          }

          var emitfn = _this.channel.send || _this.channel.emit;
          promise.then(emitfn.bind(_this.channel, resolveEventName))["catch"](emitfn.bind(_this.channel, rejectEventName)).done();

          setTimeout(function () {
            _this.emit("route", eventName, promise.inspect());
          }, 0);
        });
      }
    },
    createRouteStream: {
      value: function createRouteStream(route, eventType, content) {
        var self = this;
        // commandstart
        // channel
        // commandfinished
        // respond with route event:id
        Q.async(regeneratorRuntime.mark(function callee$2$0(iterable) {
          var commandStart, errorDetected, streamId, eventBase, errorEvent, dataEvent, onError, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, item, dataReceived, commandFinish;

          return regeneratorRuntime.wrap(function callee$2$0$(context$3$0) {
            while (1) switch (context$3$0.prev = context$3$0.next) {
              case 0:
                commandStart = self.submit.call(self, "stream:start"), errorDetected = false;
                context$3$0.next = 3;
                return commandStart;

              case 3:
                streamId = commandStart.inspect().value, eventBase = "stream:" + streamId, errorEvent = eventBase + ":error", dataEvent = eventBase + ":data";

                onError = function (err) {
                  console.error("failure on stream", err);
                  errorDetected = err;
                };

                self.channel.one(errorEvent, onError);

                context$3$0.prev = 6;
                _iteratorNormalCompletion = true;
                _didIteratorError = false;
                _iteratorError = undefined;
                context$3$0.prev = 10;
                _iterator = iterable[Symbol.iterator]();

              case 12:
                if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                  context$3$0.next = 20;
                  break;
                }

                item = _step.value;
                dataReceived = self.submit.call(self, dataEvent, item);
                context$3$0.next = 17;
                return dataReceived;

              case 17:
                _iteratorNormalCompletion = true;
                context$3$0.next = 12;
                break;

              case 20:
                context$3$0.next = 26;
                break;

              case 22:
                context$3$0.prev = 22;
                context$3$0.t0 = context$3$0["catch"](10);
                _didIteratorError = true;
                _iteratorError = context$3$0.t0;

              case 26:
                context$3$0.prev = 26;
                context$3$0.prev = 27;

                if (!_iteratorNormalCompletion && _iterator["return"]) {
                  _iterator["return"]();
                }

              case 29:
                context$3$0.prev = 29;

                if (!_didIteratorError) {
                  context$3$0.next = 32;
                  break;
                }

                throw _iteratorError;

              case 32:
                return context$3$0.finish(29);

              case 33:
                return context$3$0.finish(26);

              case 34:
                context$3$0.next = 40;
                break;

              case 36:
                context$3$0.prev = 36;
                context$3$0.t1 = context$3$0["catch"](6);

                console.error("failure on iterating", context$3$0.t1);
                errorDetected = context$3$0.t1;

              case 40:
                context$3$0.prev = 40;

                if (errorDetected) {}

                commandFinish = self.submit.call(self, "stream:end");
                context$3$0.next = 45;
                return commandFinish;

              case 45:
                return context$3$0.finish(40);

              case 46:
              case "end":
                return context$3$0.stop();
            }
          }, callee$2$0, this, [[6, 36, 40, 46], [10, 22, 26, 34], [27,, 29, 33]]);
        }));
      }
    },
    subscribe: {
      value: function subscribe(routeId) {
        var callback = arguments[1] === undefined ? _.noop : arguments[1];

        this.channel.on("routeMessage");
      }
    },
    unsubscribe: {
      value: function unsubscribe(routeId) {}
    },
    broadcast: {
      value: function broadcast() {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        this.emit.apply(this, args);
        try {
          var emitfn = this.channel.send || this.channel.emit;
          emitfn.apply(this.channel, args);
        } catch (err) {
          console.warn("error on observerchannel channel emit", args, err);
        }
      }
    },
    listenTo: {
      value: function listenTo() {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        this.channel.on.apply(this.channel, args);
      }
    },
    listenToOnce: {
      value: function listenToOnce() {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        this.channel.one.apply(this.channel, args);
      }
    },
    stopListening: {
      value: function stopListening() {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        this.channel.off.apply(this.channel, args);
      }
    }
  });

  return ObservableChannel;
})(Observable);

module.exports = ObservableChannel;

/*
  Observable = require('./Observable')
  ObservableChannel = require('./ObservableChannel');
*/

// wait one tick, should allow onError to detect errors
//let hasError = yield Q.delay(0);
//if (errorDetected) { throw errorDetected; }
//# sourceMappingURL=ObservableChannel.js.map