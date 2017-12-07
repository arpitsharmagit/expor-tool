'use babel';
'use strict';

var Q = require('q'),
    _ = require('lodash'),
    _private = require('../util/private-store').create(),
    Logger = require('../util/Logger'),
    log = new Logger('router');

_.mixin(require('../util/lodashMixins'));

log.setLevel(Logger.WARN);

class Router {
  constructor (pushHub) {

    let _serverSubscribeImpl = (routeId, deferred) => {
      return pushHub.invoke.call(pushHub, 'subscribe', routeId)
        .then( (msg) => deferred.notify({ eventType: 'subscribed', message: msg }))
        .catch(deferred.reject);
    };
    let _serverUnsubscribeImpl = (routeId, deferred) => {
      return pushHub.invoke.call(pushHub, 'unsubscribe', routeId)
        .catch( (error) => {
          log.error("Error unsubscribing from route: ", routeId, error);
          return Q.reject(error);
        });
    };

    _private(this, {
      serverSubscribe: _serverSubscribeImpl,
      serverUnsubscribe: _serverUnsubscribeImpl,
      routes: new Map()
    });

  }
  routeMessage (routeId, messageType, messageContent) {
    var {routes} = _private(this);

    if (_.isString(messageContent)) {
      try {
        messageContent = JSON.parse(messageContent);
      } catch (err) {
        log.error("Unable to parse message: ", routeId, messageType);
        messageContent = null;
      }
    }
    let route = routes.get(routeId);

    if (route) {
      route.deferred.notify({ eventType: messageType, message: messageContent });
    } else {
    }

  }
  subscribe (routeId, skipServerSubscribe = false) {
    var {routes, serverSubscribe, serverUnsubscribe} = _private(this),
        route;

    if (!routeId) {
      return Q.reject(new Error("Route is required"));
    }
    // get or initialize
    route = routes.get(routeId);
    if (!route) {
      route = {
        subscriptions: new Map(),
        deferred: Q.defer()
      };

      // automatically call server unsubscribe when resolved
      route.deferred.promise
        .finally(serverUnsubscribe.bind(this, routeId, route.deferred))
        .done();

      routes.set(routeId, route);
      if (!skipServerSubscribe) {
        return serverSubscribe(routeId, route.deferred);
      } else {
        return Q.resolve(true);
      }
    } else {
      return Q.resolve(true);
    }
  }
  getRoute(routeId) {
    var {routes} = _private(this);
    return routes.get(routeId).deferred;
  }
  get routes () {
    return _private(this).routes;
  }
  listen (routeId, resolveMessages = [], rejectMessages = [], skipServerSubscribe = false) {
    var {routes} = _private(this),
        route, subscription;

    if (!routeId) {
      return Q.reject(new Error("Route is required"));
    }
    // get or initialize
    route = routes.get(routeId);
    let subscribed = Q.resolve();
    if (!route) {
      subscribed = this.subscribe(routeId, skipServerSubscribe);
      route = routes.get(routeId);
    }

    subscription = Q.defer();

    // bind all events on route to child deferred (subscription)
    route.deferred.promise
      .then(subscription.resolve)
      .catch(subscription.reject)
      .progress(subscription.notify);

    // complete promise on provided events, and unsubscribe when complete
    let listener = bindFinalEvents(subscription, resolveMessages, rejectMessages);
    listener = listener.finally( (event) => {
      // check if parent promise already unsubscribed first
      if (route.deferred.promise.isPending()) {
        this.unsubscribe.bind(this, routeId, listener);
      }
    });

    route.subscriptions.set(listener, subscription);

    return subscribed.thenResolve(listener);
  }
  // TODO should this return rejects if not found?
  // unsubscribe from route.  if listener is provided then only remove that listener
  // unless there's no more listeners, which will then unsubscribe from server as well
  unsubscribe (routeId, listener) {
    var {routes} = _private(this);
    // lookup route using single promise input
    if (!listener && Q.isPromiseAlike(routeId)) {
      listener = routeId;
      routeId = undefined;
      for (let [id, r] of routes) {
        if (r.subscriptions.has(listener)) {
          routeId = id;
          break;
        }
      }
    }

    if (!routeId) {
      log.error("Route is required", routeId, listener);
      return Q.resolve(new Error("Route is required"));
    }

    let route = routes.get(routeId);
    if (!route) {
      log.warn('Route not found, may already have been deleted', routeId, listener);
      return Q.resolve('Route not found: ' + routeId);
    }

    let deferred;
    if (listener) {
      deferred = route.subscriptions.get(listener);

      if (!deferred) {
        log.debug('no subscription found for', routeId, listener);
        return Q.resolve(false);
      }

      // remove from list
      route.subscriptions.delete(listener);

    } else {

      // clear all listeners if single not specified
      route.subscriptions.clear();
    }

    // if no more listeners then unsubscribe from server as well
    if (!route.subscriptions.size) {
        deferred = route.deferred;
        routes.delete(routeId);
    }

    deferred.resolve({ eventType: 'unsubscribe', message: {} });

    return deferred.promise;
  }

  switchRoute (oldRouteId, newRouteId) {
    var {routes, serverSubscribe, serverUnsubscribe} = _private(this),
        deferred = Q.defer();

    let route = routes.get(oldRouteId);

    let subscribed = serverSubscribe.call(this, newRouteId, route.deferred);
    let unsubscribed = serverUnsubscribe.call(this, oldRouteId, deferred);

    return Q.all(subscribed, unsubscribed)
        .then ( (val) => {
          routes.set(newRouteId, route);
          routes.delete(oldRouteId);
          return val;
        });
  }
  addListener (routeId, resolveMessages, rejectMessages, skipServerSubscribe) {
    return this.listen.apply(this, arguments);
  }
  removeListener (routeId, listener) {
    return this.unsubscribe.apply(this, arguments);
  }

}

function bindFinalEvents (deferred, resolveMessages = [], rejectMessages = []) {
  let finalEvents = new Map();
  let rejectAction = (type, err) => deferred.reject(new FailureResult(err, type));

  resolveMessages = _.bubble(resolveMessages);
  rejectMessages = _.bubble(rejectMessages);
  _.each(resolveMessages, (name) => finalEvents.set(name, deferred.resolve));
  _.each(rejectMessages, (name) => finalEvents.set(name, rejectAction.bind(undefined, name)));

  return deferred.promise.progress( (event) => {
      // call final event to resolve/reject
      if (finalEvents.has(event.eventType)) {
        // todo, do we care about then or catch on this?
        finalEvents.get(event.eventType)(event);
      }
      return event;
    });
}

class FailureResult extends Error {
  constructor (result, issues = [], error = null) {
    let err = super(result);
    this.stack = (result instanceof Error) ? result.stack : err.stack;
    this.message = (result instanceof Error) ? result.message : err.message;
    _.extend(this, result);

    if (_.isString(issues)) {
      issues = [{id: issues}];
    }

    this.issues = [].concat(issues, result.issues);
    this.error = error || result;
  }
  hasIssue (issueId) {
    return _.any(this.issues, { id: issueId });
  }
  hasDomainIssue () {
    return _.any(this.issues, { origin: 'Domain' });
  }
  hasPlatformissue () {
    return _.any(this.issues, { origin: 'Platform' });
  }
  static build (eventType, messageContent) {
    return new FailureResult(messageContent, eventType);
  }
}

module.exports = Router;
