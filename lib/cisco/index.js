'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    CiscoRequest = require('./cisco-request'),
    model = require('../model'),
    log = new (require('../util/Logger'))('sns-main'),
    Observable = require('../util/Observable'),
    store = require('../util/global-store');

  _.mixin(require('../util/lodashMixins'));

const CISCO_API_PATH = '/vportal/services/xml/api';

class ShowAndShare extends Observable {
  constructor (config) {
    super();

    this.config = _.defaults({}, config, this.defaults);

    this.init();
  }

  init (config) {

    var cfg = _.defaults({}, config, this.config, this.defaults);
    if (!/vportal/.test(cfg.url)) {
      cfg.url = _.trim(cfg.url, '/') + CISCO_API_PATH;
    }

    this.config = cfg;

    this.api = new CiscoRequest(_.pick(cfg,
        ['username', 'password', 'url', 'proxy', 'pageSize', 'maxResults', 'callbacks', 'sortDescending']
      ));

    this.emit('init');

  }
  validateConfig (config) {

    if (!config.username) {
      throw new Error('username required');
    }

    if (!config.password) {
      throw new Error('password required');
    }

    // validate url
    if (!/https?:\/\//.test(config.url)) {
      throw new Error('invalid instance url format');
    }

  }
  // make connect with config, make sure user has admin privileges
  testConnection () {
    var username = this.config.username,
        deferred = Q.defer();

    this.validateConfig(this.config);

    if (!this.api) {
      return deferred.reject('Connection not initialized');
    }

    this.api.user.single(username)
        .then((response) => {
          if (response.vpuser) {
            return deferred.resolve(true);
          } else {
            // unrecognized input??
            return deferred.reject(response);
          }
        })
        .catch((error) => {
          if (error.message === '401 Unauthorized') {
            // handle incorrect username/password
          } else if (error.code === 'ETIMEDOUT') {
            // handle incorrect URL / PORT here
          } else if (error.message === '500 Internal Server Error') {
            // handle server down or incorrect API location
          }

          return deferred.reject(error);
        });

    return deferred.promise;
  }
  // requests content from api in pages, and streams result back to pushCallback function
  // returns a promise that resolves when complete or returns any errors
  // options.returnType can be 'raw' to not parse into models (return raw object), 'model' for transformed result
  _streamPages (pushCallback, apiRequestFunction, opts) {
    var options = _.defaults({}, pushCallback, opts, this.config),
        maxResults = options.maxResults,
        maxPages = options.maxPages,
        pageStartOffset = options.pageStartOffset || 0,
        shouldGetNextPage = true,
        apiOptions = _.pick(options, ['pageSize', 'userAgent', 'callbacks']),
        filter = options.filter,
        returnType = options.returnType || 'model',
        timeout = parseInt(options.timeout, 10) || this.config.timeout;

    apiRequestFunction = apiRequestFunction || options.apiRequestFunction;
    if (!apiRequestFunction) {
      throw new Error('api function must be defined');
    }

    if (!_.isFunction(pushCallback)) {
      pushCallback = options.pushCallback;
    }

    if (!_.isFunction(pushCallback)) {
      throw new Error('push callback must be defined');
    }

    // returns generator that doesn't immediately run
    // TODO does this need to allow a function to be passed as argument?
    return Q.async(function* () {
      var currentPage = 1,
          currentResultCount = 0,
          consumerResponse;

      // loop through all results
      // TODO: should this be <= ? make sure response always returns correct amount
      while (shouldGetNextPage && (currentResultCount < maxResults) && (currentPage < maxPages)) {
        // make request, and wait for it to complete
        let pagePromise = apiRequestFunction(currentPage + pageStartOffset, apiOptions),
            rawVendorPage = yield pagePromise;


        if (currentPage === 1) {
          if (!rawVendorPage.vpagination) {
            shouldGetNextPage = false;
          } else {

            // update maxresults with returned information
            let apiReportedTotalCount = parseInt(rawVendorPage.vpagination.totalCount, 10);
            if (_.isFinite(apiReportedTotalCount)) {
              //let prevMaxResults = maxResults;
              maxResults = Math.min(apiReportedTotalCount, maxResults);
              //log.debug('setting max results to', maxResults, 'was', prevMaxResults, 'got', apiReportedTotalCount);
            }
          }

        } else if (rawVendorPage.vpagination && !_.isFinite(rawVendorPage.vpagination.availableCount)) {
          log.debug('no results available, but NOT stopping after this page');
          //shouldGetNextPage = false;
        }

        // check for empty response
        // previous check should have set maxResults to 0 so whileloop will end
        let noDataKeys = _(rawVendorPage).keys()
                            .difference(['vprequest','vportal','vpresponse','vpagination'])
                            .isEmpty();
        if (noDataKeys) {
          log.debug('no data returned in api response, NOT continuing', rawVendorPage);
          try {
            consumerResponse = pushCallback([], rawVendorPage, currentResultCount, maxResults);
            yield new Q(consumerResponse).timeout(timeout);
          } catch (err) {
            log.warn('received error from consumer', err);
          }
          shouldGetNextPage = false;
          continue;
        }

        // convert to models
        let page;

        if (returnType === 'model') {
          try {
            page = model(rawVendorPage);
          } catch (err) {
            // on error this *should* just keep page as is
            log.debug('unable to create models for input object', page, err);
            //page = rawVendorPage;
            page = [];
          }
        } else if (returnType === 'raw') {
          page = rawVendorPage;
        } else {
          log.warn('unknown returnType: ', returnType);
          page = rawVendorPage;
        }

        // make sure page is array (uses lodash mixins)
        page = _.bubble(page);

        // allow filter against items to remove extraneous results
        if (filter) {
          try {
            page = _.filter(page, filter);
          } catch (err) {
            log.warn('unable to filter page', err);
            page = [];
          }
        }

        // chop off end if don't want more results than maximum (and max isn't 0)
        if (maxResults && (currentResultCount + page.length > maxResults)) {
          log.debug('chopping off end of page to limit results to max', currentResultCount, page.length, maxResults);
          page = page.slice(0, maxResults - currentResultCount);
        }

        // allow consumer to pause stream to avoid back pressure by returning promise
        // if the consumerResponse resolves to error it should be thrown, and end this process prematurely
        try {
          consumerResponse = pushCallback(page, rawVendorPage, currentResultCount, maxResults);

          if (consumerResponse) {
            log.debug('PAGE received response from consumer', consumerResponse);

            yield new Q(consumerResponse).timeout(timeout);
          }

        } catch (err) {
          log.error('error when pushing to consumer', err);
          throw err;
        }

        currentPage += 1;
        currentResultCount += _.isArray(page) ? page.length : 1;

        if (!page.length) {
          log.warn('zero-length page, but not stopping loop');
          //maxResults = 0;
        }

      }

      return yield consumerResponse;
    });
  }
  // TODO: add maxresults check to limit last page to certain size
  // this function spits out single items, instead of whole pages at a time
  // it's a wrapper around _streamPage that takes each page and loops through it
  _stream (pushCallback, apiRequestFunction, opts) {
    var options, timeout, returnValue, logPrefix = '';

    options = _.defaults({}, pushCallback, opts, this.config);
    pushCallback = _.isFunction(pushCallback) ? pushCallback : options.pushCallback;
    timeout = options.timeout;

    // if pushCallback isn't defined then default to aggregating and returning array of result
    if (!pushCallback) {
      returnValue = [];
      pushCallback = function (page, rawPage, index, total) {
        returnValue = returnValue.concat(page);
        return;
      };
    // allow options to define what static returnValue gets sent back
    } else if (options.returnValue) {
      returnValue = options.returnValue;
    }

    if (options.single) {
      let consumerPushCallback = pushCallback;
      pushCallback = Q.async(function* (page, rawPage, index, total) {

        // make sure page isn't single item
        if (!_.isArray(page)) {
          throw new Error(`PAGE NOT ARRAY! THIS SHOULD NEVER HAPPEN ${JSON.stringify(page)}`);
        }


        for (let [pageIndex, item] of page.entries()) {
          try {
            let consumerResponse = consumerPushCallback(item, rawPage, index+pageIndex, total);

            if (consumerResponse) {
              log.debug(logPrefix + ' STREAM received response from consumer', consumerResponse);
            }
            yield Q(consumerResponse).timeout(timeout);
          } catch (err) {
            log.error(logPrefix + ' error when pushing to consumer', err);
            throw err;
          }
        }

        // complete
        return yield true;

      });
    }

    // actually create stream of pages
    let stream = this._streamPages.call(this, pushCallback, apiRequestFunction, options);
    let promise = stream();
    // if just returning array then intercept promise with aggregate array
    if (returnValue) {
      promise = promise.then(() => returnValue);
    }
    return promise;

  }

  // gets all associated data (video info, categories, comments, etc)
  // content can be content ID, Content model or raw vpcontent object
  // TODO: maxResults also limits child requests...should be set separately or ignored for child requests
  getContent (content) {
    var self = this,
        apiCallKeys = ['single','categories',
                        'basicComments', 'timelineComments',
                        'usergroups'],
        apiCalls = _.at(self.api.content, apiCallKeys),
        streamOptions = { returnType: 'raw' };

    return Q.async(function* (content) {
      var id;
      if (_.isObject(content)) {
        id = content.vendorId || (content.id && content.id.ccsid);
      } else if (_.isString(content)) {
        id = content;
        content = {};
      }

      if (!id) {
        throw new Error('invalid or missing content id getting details');
      }

      // start off requests in parallel
      let promises = _.map(apiCalls, (apiCall, index) => {
        // curry api call to add id
        let fn = apiCall.bind(self.api, id);
        return self._stream.call(self, streamOptions, fn, {logPrefix: apiCallKeys[index]});
      });

      // wait for all to complete
      let allRequests = Q.allSettled(promises),
          all = _.zipObject(apiCallKeys, yield allRequests);

      // parse for successful values and failure reasons

      let contentData = _(all).where({ state: 'fulfilled'})
                          .pluck('value').flatten()
                          .pluck('vpcontent').value();

      let failedRequests = _.reduce(all, (result, data, key) => {
        if (data.state === 'rejected') {
          result.push({ id: id, call: key, error: data.reason });
        }
        return result;
      }, []);

      if (failedRequests.length) {
        log.warn(`some content requests failed for content id ${id}`, failedRequests);
      }

      // TODO - should this just output the original model right now it skips?
      if (!contentData.length) {
        let err = new Error(`empty results from getting full content data for ${id}`);
        err.issues = failedRequests;
        throw err;
      }

      // merge all results into single item
      let mergeFn = function (objectValue, sourceValue, key, object, source) {
        // merge in missing keys
        if (objectValue == null || objectValue === '') {
          return sourceValue;
        // only use first id key returned
        } else if (sourceValue == null || sourceValue === '') {
          return objectValue;
        // only use first id key returned
        } else if (key === 'id') {
          return objectValue;
        } else {
          log.debug('multiple values, concatenating', key, objectValue, sourceValue);
          return [].concat(objectValue).concat(sourceValue);
        }
      };
      let mergedContent = _.assign.apply(_, [{}].concat(contentData).concat(mergeFn));

      let contentModel = model({vpcontent: mergedContent});

      if (failedRequests.length) {
        contentModel.issues = failedRequests;
      }

      return yield contentModel;
    })(content);
  }
  getContentsDetailed (pushCallback, opts) {
    var self = this,
        options = _.defaults({}, pushCallback, opts, this.config),
        consumerPushCallback = _.isFunction(pushCallback) ? pushCallback : options.pushCallback,
        consumerErrorCallback = options.errorCallback || _.noop,
        consumerTimeout = options.timeout,
        results = []; // used if not consumer callback;

    let requestDetailsCallback = Q.async(function* (page, rawContentPage, index, total) {
      for (let [pageIndex, content] of page.entries()) {
        let id = content.vendorId,
            contentDetails;

        try {
          let detailsRequest = self.getContent.call(self, id);
          yield detailsRequest;

          contentDetails = detailsRequest.inspect().value;

        } catch (err) {
          log.error(`error retrieving content with id ${id}`, err, content);
          consumerErrorCallback(err, content);
          continue;
        }

        if (consumerPushCallback) {
          try {
            let consumerResponse = consumerPushCallback(contentDetails, rawContentPage, index + pageIndex, total);

            if (consumerResponse) {
              log.debug('content details received response from consumer', consumerResponse);
            }
            yield Q(consumerResponse).timeout(consumerTimeout);
          } catch (err) {
            log.error('error when pushing to consumer', err);
            throw err;
          }
        } else {
          results.push(contentDetails);
        }
      }

      return yield results;
    });

    return this._stream.call(this, requestDetailsCallback, this.api.content.page, options);
  }
  getContents (pushCallback, opts) {
    return this._stream.call(this, pushCallback, this.api.content.page, opts);
  }
  getUsers (pushCallback, opts = {}) {
    // include filter to skip readonly users, to avoid issue of LDAP overrun
    if (!opts.filter) {
      //opts.filter = (user) => user.ciscoRoles.indexOf('ReadOnly') === -1;
      opts.filter = (user) => user.ciscoRoles.length > 2;
    }

    return this._stream.call(this, pushCallback, this.api.user.page, opts);
  }
  getCategories (pushCallback, opts) {
    return this._stream.call(this, pushCallback, this.api.category.page, opts);
  }
  getUserGroups (pushCallback, opts) {

    return this._stream.call(this, pushCallback, this.api.usergroup.page, opts);
  }
  getUser (username) {
    let promise = this.api.user.single(username);
    promise = promise.then((raw) => model(raw));
    return promise;
  }
  getUserGroup (groupId) {
    let promise = this.api.usergroup.single(groupId);
    promise = promise.then((raw) => model(raw));
    return promise;
  }
  getTotalContentCount () {
    let promise = this.api.content.page({ pageSize: 1 });
    promise = promise.then((raw) => parseInt(raw.vpagination.totalCount, 10));
    return promise;
  }

  get config () {
    return store.get('config.sns');
  }
  set config (val = {}) {
    if (!_.isObject(val)) {
      throw new Error('error, tried to set config to non-object', val);
    }
    return store.set('config.sns', val);
  }
  get defaults () {
    return {
      proxy: undefined,
      portalID: 1,
      pageSize: 20,
      pageStart: 0,
      maxResults: 65536,
      maxAPIResults: 65536,
      maxPages: 2048,
      returnType: 'model',
      timeout: 60 * 5 * 1000 // default to 5 min timeout
    };
  }
}

module.exports = ShowAndShare;
