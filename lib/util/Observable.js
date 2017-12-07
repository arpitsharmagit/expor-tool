'use babel';
'use strict';

class Observable {
	constructor (cfg) {
		cfg = cfg || {};
		//eventType -> array of listener functions
		this.eventListeners = {};
		this.context = cfg.context || this;
		this.ignoreErrors = ('ignoreErrors' in cfg) ? cfg.ignoreErrors : false;

		if (cfg.listeners) {
			this.on(cfg.listeners);
		}

		this.once = this.one.bind(this);

	}
	on (eventType, listener) {
		var subscribers;

		if(arguments.length === 1) {
			let callbacks = arguments[0];
			for (let eventKey in callbacks) {
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
	one (eventType, listener) {
		if(arguments.length === 1) {
			let callbacks = arguments[0];
			for (let eventKey in callbacks) {
				this.one.call(this, eventKey, callbacks[eventKey]);
			}
		} else {
			// will be called in this.context
			let wrapper = (...args) => {
				this.off.call(this, eventType, wrapper);
				listener.apply(this, args);
			};
			this.on.call(this, eventType, wrapper);
		}
	}
	once () { return this.one.apply(this, arguments); }

	mon ($scope, eventType, listener) {
		if(arguments.length === 2){
			arguments[1].forEach( (l, e) => {
				this.mon($scope, e, l);
			});
		}	else {
			this.on(eventType, listener);
			$scope.$on('$destroy', this.off.bind(this, eventType, listener));
		}
	}

	off (eventType, listener) {
		var subscribers = this.eventListeners[eventType];
		if (subscribers) {
			subscribers.delete(listener);

			if (!subscribers.size) {
				delete this.eventListeners[eventType];
			}
		}
	}

	offAll (eventType) {
		var subscribers = this.eventListeners[eventType];
		if (subscribers) { subscribers.clear(); }
		delete this.eventListeners[eventType];
	}

	onAny (listener) { return this.on.call(this, '*', listener); }
	oneAny (listener) { return this.one.call(this, '*', listener); }
	onceAny (listener) { return this.oneAny.call(this, listener); }
	offAny (listener) { return this.off.call(this, '*', listener); }

	hasListeners () {
		return !!Object.keys(this.eventListeners);
	}

	// renamed from fire to match node EventEmitter convention
	emit (eventType, ...args) {
		var subscribers = this.eventListeners[eventType],
				allEventSubscribers = this.eventListeners['*'];

		if (allEventSubscribers) {
			let allArgs = arguments;
			allEventSubscribers.forEach( (l) => {
				try {
					l.apply(this.context, allArgs);
				} catch (err) {
					if (!this.ignoreErrors) { throw err; }
				}
			});
		}
		if (subscribers) {
			subscribers.forEach( (l) => {
				try {
					l.apply(this.context, args);
				} catch (err) {
					if (!this.ignoreErrors) { throw err; }
				}
			});
		}
	}
}

module.exports = Observable;
