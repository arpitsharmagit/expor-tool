'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    EventEmitter = require('events').EventEmitter,
    signalR = require('../../node_modules/signalr-client'),
    Observable = require('../util/Observable'),
    Logger = require('../util/Logger'),
    log = new Logger('pushhub', __filename);

// let's only hear these messages if specifically turned on
log.setLevel(Logger.WARN);


function PushHub (url, options = {}) {
  var signalRConnection,
      promises = {},
      connectionUrl = url,
      clientEvents = new Observable(),
      serverEvents = new Observable(),
      deferredHub = Q.defer(),
      self = this;

  if (!connectionUrl) {
    throw new Error('PushHub requires connection URL');
  }

  this.settings = _.defaults(options, this.defaults);

  this.promises = promises;

  this.client = clientEvents;
  this.server = serverEvents;

  this.start = function () {
    var settings = self.settings,
        retryTimeoutInSeconds = settings.retryTimeoutInSeconds,
        hubName = settings.hubName;


    signalRConnection = new signalR.client(connectionUrl, [hubName], retryTimeoutInSeconds);

    _.assign(signalRConnection.serviceHandlers, {
      connected: function (connection) {
        self.hub = signalRConnection.hub(hubName);
        deferredHub.resolve(self.hub);
        serverEvents.emit('connected');
        return false;
      },
      // retry = { inital: true/false, count: 0}
      reconnecting: function(retry ) {
          log.warn("Websocket Retrying: ", retry);
          deferredHub = Q.defer();
          serverEvents.emit('reconnecting');
          //return retry.count >= self.settings.maximumRetries; // cancel retry when true
          return true;
      },
      reconnected: function (connection) {
        self.hub = signalRConnection.hub(hubName);
        deferredHub.resolve(self.hub);
        serverEvents.emit('reconnected');
        return false;
      },
      onerror: function (error) {
        deferredHub.reject(self.hub);
        serverEvents.emit('error');
        return false;
      },
      connectFailed: function (error) {
        log.error('Could not Connect!', error);
        // TODO: not sure about how this deals with reconnecting.  Ignoring for now.  Might should reject promise
        //deferred.reject(error);
        return false;
      },
      // return false if you want to use built in management, but we don't
      // TODO: I'm not handling groups...don't know if that matters
      messageReceived: function (rawMessage) {
        var message;

        if (rawMessage.type === 'binary') {
          log.warn('ERROR: Received Binary Message, but not yet implemented', rawMessage.binaryData.length);
          return false;
        }

        if (rawMessage.type !== 'utf8' || rawMessage.utf8Data === '{}') {
          // ignore empty messages.  true would have underlying provider skip too
          //return true;
          return false;
        }

        message = JSON.parse(rawMessage.utf8Data);

        // handle server responses
        if (typeof (message.I) !== 'undefined') {
          try {
            resolveMessageListener(message);
            //return true;
            return false;
          } catch (err) {
            log.error('ERROR: handle server response', err, message);
            return false;
          }

        // handle multiple hub methods
        } else if (Array.isArray(message.M) && message.M.length) {
          let hubMessages = message.M;
          // iterate through and run routemessage on each one
          _.each(hubMessages, routeMessage, self);

          return false;
          //return true;
        }

        // if we didn't do anything then let underlying handler process
        return false;

      }

    }, self);
    signalRConnection.start();
    self.signalRConnection = signalRConnection;

    serverEvents.emit('connecting');

    return deferredHub.promise;
  };
  this.end = function () {
    signalRConnection.end();
    deferredHub = Q.defer();
    serverEvents.emit('disconnected');
  };
  this.invoke = function () {
    var hubPromise = self.getHub(),
        deferred = Q.defer(),
        args = _.slice(arguments);

    hubPromise.then(function (hub) {
      var rawPayload, payload, messageId;

      rawPayload = hub.invoke.apply(hub, args);

      try {
        payload = JSON.parse(rawPayload);
        messageId = (payload.utf8Data ? payload.utf8Data : payload).I.toString();

      } catch (err) {
        log.warn('unable to determine messageId when invoking from rawPayload', {raw: rawPayload, rawtostr: rawPayload.toString() });
        // pushHub.invoke is syncronous, but Q may not be so this is concurrency safe?
        messageId = signalRConnection.lastMessageId.toString();
      }

      promises[messageId] = deferred;

    }, deferred.reject);

    return deferred.promise;

  };

  this.getHub = function () {
    return deferredHub.promise;
  };
  this.getState = function () {
    return self.hub.state;
  };
  this.setState = function (state) {
    log.debug('Setting Hub State', state);
    self.hub.state = state;
  };

  this.clearState = function () {
    var state = self.hub.state,
        clear = {};
    for (var key in state) {
      clear[key] = undefined;
    }

    self.hub.state = clear;
  };

  // dealing with promises
  function resolveMessageListener (message) {
    var messageId = message.I.toString(),
        result = message.R,
        error = message.E,
        stackTrace = message.S,
        invocationPromise = promises[messageId];

    if (!invocationPromise) {
      throw new Error('server response but no matching promise');
    }

    promises[messageId] = null;
    delete promises[messageId];

    if (error) {
      let e = new Error(error);
      if (stackTrace) { e.stack = stackTrace; }
      invocationPromise.reject(e);
    } else {
      invocationPromise.resolve(result);
    }
  }

  // routing messages
  function routeMessage (hubMessage) {
    var state = hubMessage.S,
        // TODO: is there instance where this won't be array?
        args = hubMessage.A,
        route = args[0],
        eventName = args[1],
        data = args[2];

    // update state.  Note that this node module has a custom setter, rather than simple replace
    // TODO: should this be done here or in pushservice?
    if (state) {
      self.setState(state);
    }

    // TODO REMOVE FOR PRODUCTION!!! this is just for testing
    if (hubMessage.H.toLowerCase() !== 'push') {
      let err = new Error('unknown hub: ' + hubMessage.H);
      log.warn(err, hubMessage);
      throw err;
    }

    if (hubMessage.M.toLowerCase() !== 'routemessage') {
      let err = new Error('unknown method: ' + hubMessage.M);
      log.warn(err, hubMessage);
      throw err;
    }

    /*
    try {
      //data = JSON.parse(args[2]);
    } catch (err) {
      log.error('routemessage: invalid arguments data', err, args);
      throw err;
    }
    */

    log.debug('routing', route, eventName, data);
    clientEvents.emit('routeMessage', route, eventName, data);
  }

}

// TODO: do we want EventEmitter on PushHub or other method?
// this adds event on, emit, etc methods onto class, and adds prototype stuff
_.assign(PushHub.prototype, {
  defaults: {
    maximumRetries: 10,
    retryTimeoutInSeconds: 10,
    hubName: 'push'
  }

}, EventEmitter.prototype, PushHub.prototype);


module.exports = PushHub;
