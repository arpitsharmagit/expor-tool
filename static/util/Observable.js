"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

"use babel";
"use strict";

var Observable = (function () {
	function Observable(cfg) {
		_classCallCheck(this, Observable);

		cfg = cfg || {};
		//eventType -> array of listener functions
		this.eventListeners = {};
		this.context = cfg.context || this;
		this.ignoreErrors = "ignoreErrors" in cfg ? cfg.ignoreErrors : false;

		if (cfg.listeners) {
			this.on(cfg.listeners);
		}

		this.once = this.one.bind(this);
	}

	_createClass(Observable, {
		on: {
			value: function on(eventType, listener) {
				var subscribers;

				if (arguments.length === 1) {
					var callbacks = arguments[0];
					for (var eventKey in callbacks) {
						this.on(eventKey, callbacks[eventKey]);
					}
				} else {
					subscribers = this.eventListeners[eventType];
					if (!subscribers) {
						subscribers = this.eventListeners[eventType] = new Set();
					}
					subscribers.add(listener);
				}
			}
		},
		one: {
			value: function one(eventType, listener) {
				var _this = this;

				if (arguments.length === 1) {
					var callbacks = arguments[0];
					for (var eventKey in callbacks) {
						this.one.call(this, eventKey, callbacks[eventKey]);
					}
				} else {
					(function () {
						// will be called in this.context
						var wrapper = function () {
							for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
								args[_key] = arguments[_key];
							}

							_this.off.call(_this, eventType, wrapper);
							listener.apply(_this, args);
						};
						_this.on.call(_this, eventType, wrapper);
					})();
				}
			}
		},
		once: {
			value: function once() {
				return this.one.apply(this, arguments);
			}
		},
		mon: {
			value: function mon($scope, eventType, listener) {
				var _this = this;

				if (arguments.length === 2) {
					arguments[1].forEach(function (l, e) {
						_this.mon($scope, e, l);
					});
				} else {
					this.on(eventType, listener);
					$scope.$on("$destroy", this.off.bind(this, eventType, listener));
				}
			}
		},
		off: {
			value: function off(eventType, listener) {
				var subscribers = this.eventListeners[eventType];
				if (subscribers) {
					subscribers["delete"](listener);

					if (!subscribers.size) {
						delete this.eventListeners[eventType];
					}
				}
			}
		},
		offAll: {
			value: function offAll(eventType) {
				var subscribers = this.eventListeners[eventType];
				if (subscribers) {
					subscribers.clear();
				}
				delete this.eventListeners[eventType];
			}
		},
		onAny: {
			value: function onAny(listener) {
				return this.on.call(this, "*", listener);
			}
		},
		oneAny: {
			value: function oneAny(listener) {
				return this.one.call(this, "*", listener);
			}
		},
		onceAny: {
			value: function onceAny(listener) {
				return this.oneAny.call(this, listener);
			}
		},
		offAny: {
			value: function offAny(listener) {
				return this.off.call(this, "*", listener);
			}
		},
		hasListeners: {
			value: function hasListeners() {
				return !!Object.keys(this.eventListeners);
			}
		},
		emit: {

			// renamed from fire to match node EventEmitter convention

			value: function emit(eventType) {
				var _this = this;

				var _arguments = arguments;

				for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
					args[_key - 1] = arguments[_key];
				}

				var subscribers = this.eventListeners[eventType],
				    allEventSubscribers = this.eventListeners["*"];

				if (allEventSubscribers) {
					(function () {
						var allArgs = _arguments;
						allEventSubscribers.forEach(function (l) {
							try {
								l.apply(_this.context, allArgs);
							} catch (err) {
								if (!_this.ignoreErrors) {
									throw err;
								}
							}
						});
					})();
				}
				if (subscribers) {
					subscribers.forEach(function (l) {
						try {
							l.apply(_this.context, args);
						} catch (err) {
							if (!_this.ignoreErrors) {
								throw err;
							}
						}
					});
				}
			}
		}
	});

	return Observable;
})();

module.exports = Observable;
//# sourceMappingURL=Observable.js.map