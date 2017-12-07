'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    EventEmitter = require('events').EventEmitter,
    PushService = require('./PushService'),
    UserService = require('./UserService'),
    RestService = require('./RestService'),
    MediaService = require('./MediaService'),
    UploadService = require('./UploadService'),
    CategoryService = require('./CategoryService'),
    SearchService = require('./SearchService'),
    _private = require('../util/private-store').create(),
    store = require('../util/global-store'),
    Logger = require('../util/Logger'),
    log = new Logger('RevConnection');


const STATE = {
  CONNECTED: 'connected',
  READY: 'ready',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

function validatePromise (promise, expectedType) {
  var response;

  if (!promise) {
    throw new Error('No Api Response');
  }

  response = promise.inspect();

  if (response.state === 'rejected') {
    throw new Error(promise.reason);
  }

  response = response.value;
  if (expectedType) {
    let type = response.type || response.eventType;
    if (type != expectedType) {
      throw new Error(response);
    }
  }

  return response;
}

class Session {
  constructor (connection, interval = (5 * 60 * 1000), maxFailures = 10) {
    var self = this,
        rev = connection,
        timer,
        failureCount = 0;

    function keepAlive () {
      timer = setTimeout(keepAlive, interval);
      try {
        let context = _private(rev);
        if (!context) {
          log.warn('No RevConnection private context, cannot extend session');
          self.end();
        }
        let userId = context.userId;
        if (rev && rev.state === STATE.CONNECTED) {
          rev.user.extendSessionTimeout(userId)
            .catch((err) => {
              log.warn('Extend Session Error, reconnecting', err);
              failureCount += 1;
              return Q.async(function* () {
                let p = Q.delay(500); // put slight delay in on retry

                log.warn('Extend Session: disconnect');
                p = rev.disconnect();
                yield p;
                log.warn('Extend Session: connect');
                p = rev.connect();
                return yield p;
              }).call(self);

            });
        }
      } catch (err) {
        failureCount += 1;

        log.log('error in keepalive', err, failureCount);
        if (failureCount >= maxFailures) {
          self.end();
        }
      }
    }

    Object.defineProperties(this, {
      begin: {
        value: () => {
          timer = setTimeout(keepAlive, interval);
          return self;
        }
      },
      end: {
        value: () => {
          clearTimeout(timer);
          timer = null;
          connection = null;
          return self;
        }
      }
    });

  }

}

class RevConnection extends EventEmitter {
  constructor (baseUrl, options) {
    var token;

    super();
    // used to store private vars
    // session will be used to send periodic keepalives
    _private(this, {
      session: new Session(this),
      config: {}
    });

    Object.defineProperties(this, {
      token: {
        get: () => token,
        set: (val) => {
          token = val;
          _private(this).token = token;
          this.push.setToken(token);
          this.rest.setToken(token);
        }
      },
      accountId: {
        get: () => _private(this).accountId
      },
      userId: {
        get: () => _private(this).userId
      },
      context: {
        get: () => _private(this)
      },
      dispatchCommand: {
        get: () => _private(this).dispatch
      },
      resource: {
        get: () => _private(this).resource
      }
    });


    if (arguments.length) {
      this.init.apply(this, arguments);
    }

  }
  init (baseUrl, options = {}) {
    // if already connected disconnect and apply new options
    if (this.isConnected) {
      this.state = STATE.DISCONNECTED;
      return this.disconnect().then(this.init.apply(this, arguments));
    }

    if (_.isObject(baseUrl)) {
      options = baseUrl;
      baseUrl = options.url;
    } else {
      options.url = baseUrl;
    }

    this.config = _.merge({}, this.config, options);

    let pushOptions = options.push || options,
        restOptions = options.rest || options;

    this.baseUrl = baseUrl;
    // SignalR connection
    this.push = new PushService(baseUrl, pushOptions);
    // for REST calls
    this.rest = new RestService(baseUrl, restOptions);

    // for subscriptions
    this.router = this.push.router;

    // relay push's broadcast events -- not currently enabled
    //this.push.on('*', this.emit.bind(this));

    _private(this).dispatch = this.push.dispatchCommand.bind(this.push);
    _private(this).resource = this.rest.resource.bind(this.rest);


    // collection of APIs
    this.user = new UserService(this);
    this.upload = new UploadService(this);
    this.media = new MediaService(this);
    this.category = new CategoryService(this);
    this.search = new SearchService(this);

    this.state = STATE.READY;

  }
  connect (username = this.config.username, password = this.config.password) {
    var self = this,
        context = _private(this);

    return Q.async(function* () {
      var p;

      p = self.push.connect();
      yield p;

      p = self.user.authenticateUser(username, password);
      yield p;

      let user = validatePromise(p),
          token = user.token;

      // update private data
      self.token = token;

      p = self.user.getAccountId(user.id);
      yield p;

      let accountId = validatePromise(p);

      _.assign(context, {
        user: user,
        userId: user.id,
        accountId: accountId,
        token: token
      });

      try {
        p = Q.all([
          self.push.subscribe(context.userId),
          self.push.subscribe(context.accountId)
        ]);
        yield p;
        validatePromise(p);
      } catch (err) {
        log.error('subscribe error', err);
      }
      //TODO: createSubscription to allow mutable route?

      self.state = STATE.CONNECTED;
      self.emit('connected');

      context.session.begin();

      return yield self;
    }).call(this);

  }
  disconnect () {
    var context = _private(this),
        promise;

    context.session.end();

    promise = Q.all([
      this.push.unsubscribe(context.userId),
      this.push.unsubscribe(context.accountId)
    ]);

    return promise.finally( (...args) => {
        this.push.disconnect();
        this.state = STATE.DISCONNECTED;
        this.emit('disconnected');
        return null;
      });
  }
  get isConnected () {
    return this.state === STATE.CONNECTED;
  }
  get config () {
    return store.get('config.rev');
  }
  set config (val = {}) {
    if (!_.isObject(val)) {
      throw new Error('error, tried to set config to non-object', val);
    }
    return store.set('config.rev', val);
  }
}

module.exports = RevConnection;
