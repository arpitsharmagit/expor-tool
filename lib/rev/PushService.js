'use babel';
'use strict';

// TODO: make sure you have a timeout for promises...
// TODO: may also need to handle disconnection inturruption


var _ = require('lodash'),
    Q = require('q'),
    PushHub = require('./PushHub'),
    Router = require('./Router'),
    _private = require('../util/private-store'),
    EventEmitter = require('events').EventEmitter,
    Observable = require('../util/Observable'),
    Logger = require('../util/Logger'),
    log = new Logger('pushservice');

_.mixin(require('../util/lodashMixins'));

log.setLevel(Logger.INFO);

class PushService extends EventEmitter {
  constructor (baseUrl, options = {}) {
    var pushHub;
    super({wildcard: true});

    if (baseUrl instanceof PushHub) {
      pushHub = baseUrl;
    } else if (_.isString(baseUrl)) {
      if (!/push\/signalr$/.test(baseUrl)) {
        baseUrl = baseUrl.replace(/\/$/, '') + '/push/signalr';
      }
      if (/^https/.test(baseUrl)) {
        baseUrl = baseUrl.replace(/^https/, 'wss');
      }
      pushHub = new PushHub(baseUrl, options);
    }

    this.router = new Router(pushHub);


    this.settings = _.defaults(options, this.defaults);

    // used to keep track of all pending promises from 'dispatchCommand'
    this.activeConnections = 0;

    // TODO: setup useragent specifying
    this.userAgent = this.settings.userAgent;

  // TODO: should this just get initialized here?
    this.pushHub = pushHub;

    _private(this, {
      subscriptions: {},
      commandRouteListeners: {},
      connectionState: null,
      router: this.router
    });

    let onReconnect = (event) => {
      var subscriptions = _private(this).subscriptions;
      _.each(subscriptions, function(subscribed, route){
        if(subscribed){
          log.info("Resubscribe: ", route);
          this.subscribe(route)
            .catch(function(error){
              log.error("Error resubscribing to route: ", route, error);
            });
        }
      });
    };

    pushHub.server.on({
      // TODO: not implemented in PushHub.js
      stateChanged: (event) => { _private(this).connectionState = event.newState; },
      reconnected: onReconnect,
      ConnectionReestablished: onReconnect
    });

    pushHub.client.on({
      routeMessage: (route, messageType, messageContent) => {
        var {router} = _private(this);

        try {
          messageContent = JSON.parse(messageContent);

          var suppress = false;

          if (messageType === "CommandFinished") {
            if (messageContent && (messageContent.type === "MessageScheduled" || messageContent.type === "SessionTimeoutExtended")) {
              suppress = true;
            }
          }

          if (!suppress) {
            log.info("Inbound message: ", route, messageType, messageContent);
          } else {
            log.debug('supressed inbound message', route, messageType, messageContent);
          }
        } catch (e) {
          log.error("Unable to parse message: ", route, messageType);
          messageContent = null;
        }
        router.routeMessage(route, messageType, messageContent);

        // TODO: will I need to listen to global broadcast messages?
        //this.emit(`Push.${messageType}.${route}`, messageContent);
      }
    });


  }
  connect () {
    return this.pushHub.start().thenResolve(this);
  }
  disconnect () {
    return this.pushHub.end();
  }
  getToken () {
    return this.token;
  }
  setToken (token) {
    this.token = token;
    this.pushHub.setState({token: token});
  }
  deleteToken () {
    this.token = undefined;
    this.pushHub.clearState();
  }
  // subscribe to route.  returns promise that is updated with progress events on any messages along this route.  final events allow you to automatically unsubscribe
  subscribe (route, resolveMessages = [], rejectMessages = []) {
    var {router} = _private(this);

    log.debug("Subscribe to route: ", route);
    if (resolveMessages.length || rejectMessages.length) {
      return router.listen(route, resolveMessages, rejectMessages);
    }
    return router.subscribe(route);

  }
  unsubscribe (route, listener) {
    var {router} = _private(this);

    log.debug("Unsubscribe to route: ", route);
    return router.unsubscribe(route, listener);

  }
  addRouteListener (routeId, resolveMessages = [], rejectMessages = []) {
    var {router} = _private(this);

    log.debug("Listening to route: ", routeId);
    return router.addListener(routeId, resolveMessages, rejectMessages);
  }
  // use this one to timeout after default amount
  addTransientRouteListener (routeId, resolveMessages = [], rejectMessages = [], timeoutInSeconds) {
      var timeout = timeoutInSeconds || this.settings.routeTimeoutInSeconds * 1000;

      let promise = this.addRouteListener.apply(this, arguments);

      return promise.timeout(timeout);

  }
  removeRouteListener (routeId, promise) {
    var {router} = _private(this);
    log.debug("STOP Listening to route: ", routeId);
    return router.removeListener(routeId, promise);
  }
  //Helper to allow subscribing to a mutable route.
  //For example, subscribing to the accountId or userId
  createSubscription () {
    var route;
    return {
      setRoute: (newRoute) => {
        var promises = [];
        if (route !== newRoute) {
          if (route) {
            promises.push(this.unsubscribe(route));
          }

          if (newRoute) {
            promises.push(this.subscribe(newRoute));
          }
          route = newRoute;
        }
        return Q.all(promises);
      }
    };
  }
  // listens for a specific messge on a route
  onRouteMessage (routeId, successMessageTypes = [], rejectMessageTypes = []) {
    var {commandRouteListeners, subscriptions} = _private(this);

    // allow single values instead of arrays
    successMessageTypes = _.bubble(successMessageTypes);
    rejectMessageTypes = _.bubble(rejectMessageTypes);

    return Q.async(function* () {
      var callbacks = {}, deferred = Q.defer();

      if (!subscriptions[routeId]) {
        let p = this.subscribe(routeId);
        yield p;
      }

      if (!commandRouteListeners[routeId]) {
        commandRouteListeners[routeId] = new Observable();
      }

      // remove all defined listeners and resolve/reject
      let callback = (action, route, messageContent) => {
        let emitter = commandRouteListeners[routeId];
        // remove all defined listeners
        _.each(callbacks, (cb, evt) => emitter.off(evt, cb));

        // if nothing else listing to route then delete
        if (!emitter.hasListeners()) {
          // TODO I don't know if it's necessary to wait for unsubscribe...
          delete commandRouteListeners[routeId];
          this.unsubscribe.call(this, routeId);
        }

        return action(messageContent);
      };

      // bind all callbacks, and add to listener
      _.each(successMessageTypes, (msg) => {
        callbacks[msg] = callback.bind(this, deferred.resolve);
      });

      // provide helpful error on rejection
      let rejectAction = (messageType, messageContent) => {
        let err = new Error(messageContent);
        err.issues = [{id: messageType}];
        err.error = messageContent;
        deferred.reject(buildFailureResult(err));
      };

      _.each(rejectMessageTypes, (msg) => {
        callbacks[msg] = callback.bind(this, rejectAction.bind(this, msg));
      });

      _.each(callbacks, (cb, messageType) => {
        commandRouteListeners[routeId].on(messageType, cb);
      });


      return yield deferred.promise;

    }).call(this);

  }
  dispatchCommand (commandType, content, finalEvents = []) {
    var dispatchPromise, commandPromise,
        {router} = _private(this);

    finalEvents = _.bubble(finalEvents);
    /*if (finalEvents && !Array.isArray(finalEvents)) {
      finalEvents = [finalEvents];
    }*/

    if (commandType === "network:LogOn" || commandType === "network:ConfirmUser") {
      log.info("Dispatching command: ", commandType);
    }
    else if (commandType !== "network:ExtendSessionTimeout") {
      log.info("Dispatching command: ", commandType, content);
    }

    content = JSON.stringify(content);
    dispatchPromise = this.pushHub.invoke('dispatchCommand', commandType, 'application/json', content, this.userAgent);

    commandPromise = dispatchPromise.then( (commandId) => {
      var deferred = Q.defer();

      if(commandType !== "network:ExtendSessionTimeout") {
        log.debug("Sent Command: ", commandId, commandType);
      }

      // commands are automatically subscribed to that route
      if (commandId) {
        let resolveEvents = _.isEmpty(finalEvents) ? 'CommandFinished' : finalEvents,
            rejectEvents = ['CommandStopped', 'CommandDenied'],
            skipServer = true,
            route = router.listen(commandId, resolveEvents, rejectEvents, skipServer);

        route
          .then( (result) => {
            log.debug('command result in pushservice', result);
            if (result.message && result.message.type) {
              result.message.eventType = result.eventType;
              return result.message;
            } else {
              return result;
            }
          })
          .catch( (err) => {
            log.warn('error in command', err);
            return Q.reject(err);
          })
          .then(deferred.resolve)
          .catch(deferred.reject)
          .progress(deferred.notify)
          .done();


      } else {
        log.warn('no commandID', commandId);
        //todo: add any signalR exceptions to reject object
        deferred.reject(buildFailureResult());
      }

      trackConnections.call(this, deferred.promise);

      return deferred.promise;

    }, (error) => {
      log.error("Failed to send command: ", error);
      return Q.reject(buildFailureResult({ error: error }));
    });

    // looks like this is used to allow attachments to initial response.  don't think we need this
    // only time it seems to be used is in webcasts in case of reconnection
    //commandPromise.$commandId = dispatchPromise;

    return commandPromise;

  }
  // override allows for 'any' listeners
  emit (eventName) {
    if (eventName !== '*') {
      super.emit.apply(this, ['*'].concat(_.toArray(arguments)));
    }
    return super.emit.apply(this, arguments);
  }
  get defaults() {
    return {
      userAgent: "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36",
      maximumRetries: 10,
      retryTimeoutInSeconds: 10,
      hubName: 'push',
      routeTimeoutInSeconds: 60 * 10 // 10 min, should be lower usually
    };
  }
}

// will be called to keep track of how many open requests are going on.  called in context of request
function trackConnections (promise) {
  this.activeConnections += 1;
  promise.finally( () => {
    this.activeConnections -= 1;
  });
}

function buildFailureResult (result) {
  return _.extend({
    issues: [],

    hasIssue: function(issueId){
      return _.findIndexBy(this.issues, function(issue) { return issue.id === issueId; }) >= 0;
    },

    hasDomainIssue: function(){
      return _.findIndexBy(this.issues, function(issue) { return issue.origin === 'Domain'; }) >= 0;
    },

    hasPlatformIssue: function(){
      return _.findIndexBy(this.issues, function(issue) { return issue.origin === 'Platform'; }) >= 0;
    }
  }, result || {});
}

module.exports = PushService;
