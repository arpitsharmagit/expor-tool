'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    http = require('http'),
    request = require('requestretry'),
    Logger = require('../util/Logger'),
    log = new Logger('restservice');
    //request = require('request');
log.setLevel(Logger.INFO);
// hack to allow defaults to get set, replaces singleton object which is bad!
function setDefaultRequestOptions (options) {
  var base = request.Request.request.defaults(options);
  request.Request.request = base;
  return request;
}

class RestService {
  constructor (baseUrl, opts = {}) {
    var self = this,
        options = _.defaults({}, opts, this.constructor.defaults);

    if (!_.isString(baseUrl)) {
      throw new Error('base url must be defined');
    }



    //console.warn('REQUEST: SETTING KEEPALIVE ON GLOBAL USER AGENT');
    http.globalAgent.keepAlive = false;
    http.globalAgent.maxSockets = Infinity;

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cookies = request.jar || request.Request.request.jar();
    this.token = '';
    this.activeRequests = 0;


    this.headers = _.defaults({}, options.headers, {'User-Agent': options.userAgent});

    let defaultRequestOptions = {
      jar: this.cookies,
      headers: this.headers,
      json: true,
      pool: {
        maxSockets: 10000
      },
      agentOptions: {
        maxSockets: Infinity
      },
      strictSSLL: false,
      maxAttempts: 5,   // (default) try 5 times
      retryDelay: 5000  // (default) wait for 5s before trying again
    };

    if (options.proxy) {
      defaultRequestOptions.proxy = options.proxy;
    }

    log.warn('setting request timeout to 15 seconds');
    defaultRequestOptions.timeout = 15000;

    if (options.uploadTimeoutInSeconds) {
      defaultRequestOptions.timeout = options.uploadTimeoutInSeconds * 1000;
    }

    //this.baseRequest = request.defaults(defaultRequestOptions);
    this.baseRequest = setDefaultRequestOptions(defaultRequestOptions);

    if (options.token) {
      this.setToken(options.token);
    }

    // defining here to ensure it's bound properly
    Object.defineProperty(this, 'resource', {
      value: (path) => {
        // make sure it begins with a slash
        if (!/^\//.test(path)) {
          path = '/' + path;
        }

        var result = self.makeRequest.bind(self, undefined, path);
        result.get = self.makeRequest.bind(self, 'GET', path);
        result.post = self.makeRequest.bind(self, 'POST', path);
        result.put = self.makeRequest.bind(self, 'PUT', path);
        result.delete = self.makeRequest.bind(self, 'DELETE', path);
        return result;
      },
      enumerable: true
    });

  }
  setToken (token) {
    this.token = token;
    this.cookies.setCookie(`vbrickAccessToken=${token}`, this.baseUrl);
    this.headers.Authorization = `VBrick ${token}`;
    this.baseRequest = setDefaultRequestOptions({
      jar: this.cookies,
      headers: this.headers
    });
    return this.baseRequest;
  }
  makeRequest (method = 'GET', path = '', data = {}, options = {}) {
    var re = /:([^\/:]*)/g,
        deferred = Q.defer();

    if (data && !_.isObject(data)) {
      let key = (re.exec(path) || [])[1];
      if (key) {
        let val = data;
        data = {};
        data[key] = val;
      } else {
        throw new Error('invalid data argument: ' + data);
      }
    }

    let urlKeys = [];
    let uri = path.replace(re, (match, key) => {
        if (key in data) {
          urlKeys.push(key);
          return data[key];
        } else {
          return '';
        }
      });

    // make sure the authorization header is preserved
    let headers = _.merge({}, this.headers, options.headers);

    let requestOptions = _.merge({
        uri: this.baseUrl + uri,
        qs: _.omit(data, urlKeys),
        method: method
      }, _.omit(options, 'beforeSend'), { headers: headers });

    let req = this.baseRequest(requestOptions, (error, response, body) => {
      if (error) {
        return deferred.reject(error);
      }

      // handle bad HTTP response
      if (response.statusCode !== 200) {
        let e = new Error([response.statusCode, response.statusMessage].join(' '));

        if (_.isObject(response.body)) {
          let body = response.body;
          if (body.detail) {
            e.message = body.detail;
          }
          if (body.code) {
            e.issues = [{id: body.code}];
          }
        }
        return deferred.reject(e);
      }
      deferred.resolve(body);
    });

    // delay to allow more verbose error to reject first
    req.on('abort', _.delay.bind(_, deferred.reject, 0, 'Aborted'));

    // just in case
    req.on('error', function (err) {
      if (err.code === 'ETIMEDOUT') {
        let reqTimeout = (req.timeout || 0) / 1000,
            message = 'Timeout' + (reqTimeout ? ' after ' + reqTimeout + ' seconds' : '');
        err.issues = [{id: err.code}];
        err.message = message;
      } else {
        err.issues = [{id: err.code}];
      }
      log.warn(uri, err);
      deferred.reject(err);
    });

    /*
    // extra call to ensure HTTPS sockets get updated on progress
    if (method === 'POST') {
      req.on('socket', function (socket) {

      });
    }
    */

    // FIXME this is becuase we're using the requestretry library
    req = req._req;

    let oldEmit = req.emit;
    req.emit = function (eventName, x) {
      if (eventName === 'data') log.debug('data', x.length);
      else if (eventName !== 'drain') {
        log.debug(eventName, uri);
      }
      return oldEmit.apply(req, arguments);
    };
    global.req = req;

    trackRequests.call(this, deferred.promise);

    // allow ability to return request to support abort
    if (_.isFunction(options.beforeSend)) {
      try {
        options.beforeSend(req, deferred);
      } catch (err) {
        log.warn('error on beforeSend callback', err);
        deferred.reject(err);
      }
    }

    return deferred.promise;
  }
  get log () {
    return log;
  }
  static get defaults () {
    return {
      userAgent: "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Atom/0.186.0 Chrome/40.0.2214.91 AtomShell/0.21.0 Safari/537.36",
      proxy: undefined
    };
  }
}

// will be called to keep track of how many open requests are going on.  called in context of request
var trackRequests = function (promise) {
  this.activeRequests += 1;
  promise.finally( () => {
    this.activeRequests -= 1;
  });
};

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

module.exports = RestService;
