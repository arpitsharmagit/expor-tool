'use babel';
'use strict';
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

var Q = require('q'),
    _ = require('lodash'),
    Observable = require('./Observable');

const DEFAULT_TIMEOUT = 60 * 1000 * 15; // 15 min

class ObservableChannel extends Observable {
  constructor (cfg = {}) {
    super(cfg);
    this.timeout = cfg.timeout || DEFAULT_TIMEOUT;
    this.channel = cfg.channel || new Observable();
  }

  submit (eventName, ...args) {
    var messageId = _.uniqueId(),
        resolveEventName = `${eventName}:${messageId}:resolve`,
        rejectEventName = `${eventName}:${messageId}:reject`,
        deferred = Q.defer();

    this.channel.on(resolveEventName, deferred.resolve);
    this.channel.on(rejectEventName, deferred.reject);

    let promise = deferred.promise;

    if (this.timeout) {
      promise = promise.timeout(this.timeout);
    }

    promise = promise.finally( (...args) => {
      this.channel.off(resolveEventName, deferred.resolve);
      this.channel.off(rejectEventName, deferred.reject);
      return;
    });

    // ensure asyncronous calls
    setTimeout( () => {
      this.emit.apply(this, ['submit', eventName, messageId].concat(args));
      let emitfn = this.channel.send || this.channel.emit;
      emitfn.apply(this.channel, [eventName, messageId].concat(args));
    }, 0);

    return promise;
  }

  // any time an event is received then run callback
  // callback should return a promise
  route (eventName, callback = _.noop) {
    this.channel.on(eventName, (messageId, ...args) => {
      var resolveEventName = `${eventName}:${messageId}:resolve`,
          rejectEventName = `${eventName}:${messageId}:reject`,
          promise;

      try {
        promise = Q(callback.apply(this.context, args));
      } catch (err) {
        promise = Q.reject(err);
      }
      if (this.timeout) {
        promise = promise.timeout(this.timeout);
      }

      let emitfn = this.channel.send || this.channel.emit;
      promise
        .then(emitfn.bind(this.channel, resolveEventName))
        .catch(emitfn.bind(this.channel, rejectEventName))
        .done();

      setTimeout( () => {
        this.emit('route', eventName, promise.inspect());
      }, 0);

    });
  }
  createRouteStream (route, eventType, content) {
    var self = this;
    // commandstart
    // channel
    // commandfinished
    // respond with route event:id
    Q.async(function* (iterable) {
      var commandStart = self.submit.call(self, 'stream:start'),
          errorDetected = false;
      yield commandStart;

      let streamId = commandStart.inspect().value,
          eventBase = `stream:${streamId}`,
          errorEvent = eventBase + ':error',
          dataEvent = eventBase + ':data';

      let onError = (err) => {
        console.error('failure on stream', err);
        errorDetected = err;
      };

      self.channel.one(errorEvent, onError);

      try {
        for (let item of iterable) {
            let dataReceived = self.submit.call(self, dataEvent, item);
            yield dataReceived;

            // wait one tick, should allow onError to detect errors
            //let hasError = yield Q.delay(0);
            //if (errorDetected) { throw errorDetected; }
        }
      } catch (err) {
        console.error('failure on iterating', err);
        errorDetected = err;
      } finally {
        if (errorDetected) {
        }

        let commandFinish = self.submit.call(self, 'stream:end');
        yield commandFinish;

      }

    });
  }
  subscribe (routeId, callback = _.noop) {
    this.channel.on('routeMessage' );
  }
  unsubscribe (routeId) {

  }
  broadcast (...args) {
    this.emit.apply(this, args);
    try {
      let emitfn = this.channel.send || this.channel.emit;
      emitfn.apply(this.channel, args);
    } catch (err) {
      console.warn('error on observerchannel channel emit', args, err);
    }
  }
  listenTo (...args) {
    this.channel.on.apply(this.channel, args);
  }
  listenToOnce (...args) {
    this.channel.one.apply(this.channel, args);
  }
  stopListening (...args) {
    this.channel.off.apply(this.channel, args);
  }
}

module.exports = ObservableChannel;

/*
  Observable = require('./Observable')
  ObservableChannel = require('./ObservableChannel');
*/
