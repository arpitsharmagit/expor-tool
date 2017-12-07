'use babel';
'use strict';


const CISCO_SAMPLEAPP_USERAGENT = 'Mozilla/5.0 (Windows; U; en-US) AppleWebKit/533.19.4 (KHTML, like Gecko) AdobeAIR/14.0';

var _ = require('lodash'),
    Q = require('q'),
    request = require('request'),
    xml2js = require('xml2js'),
    $js = require('JSONSelect'),
    Logger = require('../util/Logger'),
    log = new Logger('cisco-request');


// IMPORTANT! MUST DO THIS TO ALLOW SELF SIGNED CERTIFICATES
//log.warn('CHANGING NODE ENVIRONMENT SECURITY SETTINGS TO ALLOW SELF-SIGNED CERTIFICATES');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";



// TODO: paging *may* be off, where first page gets one less than it should (pagesize = 3 then get back two items).
function CiscoRequest (settings = {}) {
  this.settings = _.defaults(settings, this.defaults);

  this.parser = new xml2js.Parser(this.settings.parserOptions);

  _.extend(this, {
    post: (opts = {}) => {
      var deferred = Q.defer(),
          options = _.defaults(opts, this.settings),
          requestOptions = {
            uri: options.url,
            body: options.body,
            encoding: 'utf8',
            auth: {
                    'user': options.username,
                    'pass': options.password
                  },
            headers: {
              'content-type': 'application/xml',
              'User-Agent': options.userAgent
            }

          };

      if (options.proxy) {
        requestOptions.proxy = options.proxy;
      }

      if (!options.body || !options.username || !options.password || !options.url) {
        throw new Error('Incorrect request parameters.  Missing body, url or authentication');
      }

      // add a hook that allows the request to be modified before sending
      try {
        if (_.isFunction(options.callbacks.beforeSend)) {
          let modifiedRequest = options.callbacks.beforeSend(requestOptions);
          if (modifiedRequest) {
            _.extend(requestOptions, modifiedRequest);
          }
        }
      } catch (err) {
        log.warn('Error calling api beforeSend', err);
      }

      // make actual post request
      request.post(requestOptions, function (error, response, body) {
        if (error) {
          return deferred.reject(error);
        }

        // handle bad HTTP response
        if (response.statusCode != 200) {
          return deferred.reject(new Error([response.statusCode, response.statusMessage]
            .join(' ')));
        }
        deferred.resolve(body);
      });

      // return promise that first transforms the raw xml response to javascript object
      let promise = deferred.promise
          .then( (xml) => {
              // add hook that allows modifying / copying raw results
              if (_.isFunction(options.callbacks.beforeParse)) {
                try {
                  let modifiedXML = options.callbacks.beforeParse(xml, requestOptions);
                  // if there's a response then replace xml
                  if (_.isString(modifiedXML)) {
                    xml = modifiedXML;
                  }
                } catch (err) {
                  log.warn('Error calling api beforeParse', err);
                }
              }

              // parse xml into javascript object
              return Q.nfcall(this.parser.parseString, xml);
          }).then ( (obj) => {

            if (_.isFunction(options.callbacks.afterParse)) {
              try {
                let modifiedObject = options.callbacks.afterParse(obj, requestOptions);
                // if there's a response then replace xml
                if (_.isObject(modifiedObject)) {
                  obj = modifiedObject;
                }
              } catch (err) {
                log.warn('Error calling api afterParse', err);
              }
            }

            // this indicates that there was some sort of error response
            if ('false' === (obj.response || obj.vpresponse && obj.vpresponse.response)) {
              log.error('SnS error response detected', obj, requestOptions);
              throw obj;
            }

            return obj;
          });

      return promise;

    },
    makeRequest: (methodName, body, pageNumber, options = {}) => {
      var pagination = '',
          xml;

      if (_.isObject(pageNumber)) {
        options = pageNumber;
        pageNumber = options.page || options.pageNumber || undefined;
      }
      // add paging if necessary
      //if (true) {}
      //if (methodName !== 'searchContent') {}
      if (pageNumber !== undefined) {
        let pageSize = options.pageSize || this.settings.pageSize,
            pageStart = (pageNumber - 1) * pageSize,
            pageLimit = pageStart + pageSize;

        pagination =
                `<vp:vpagination xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
                  <limit>${pageSize}</limit>
                  <offset>${pageStart}</offset>
                  <totalCount>0</totalCount>
                  <availableCount>0</availableCount>
                </vp:vpagination>`;
      }

      xml = `<xml-fragment>
                <vp:vprequest xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
                  <query>${methodName}</query>
                </vp:vprequest>
                <vp:vportal xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
                  <vportal_id>${this.settings.portalID}</vportal_id>
                </vp:vportal>
                ${body}
                ${pagination}
              </xml-fragment>`;

      let opts = _.extend({body: xml}, options);
      return this.post(opts);
    },
    search: (filter = {}, pageNumber = 1, options = {}) => {
      if (_.isObject(pageNumber)) {
        options = pageNumber;
        pageNumber = options.page || options.pageNumber || 1;
      }

      var categoryPath = (filter.category) ? filter.category : '',
          searchText = (filter.text) ? filter.text : '',
          author = '', body,
          sortCriteria = '<sortCriteriaList/>',
          pageSize = Math.max(options.pageSize || this.settings.pageSize, 5),
          pageStart = (pageNumber - 1) * pageSize,
          pageLimit = pageStart + (pageSize - 1),
          sortDescending = this.settings.sortDescending || false;

      if (!pageLimit) {
        pageLimit = 100;
      }

      if (filter.author) {
        author = `<searchParam>
          <fieldName>author</fieldName>
          <fieldValue>${filter.author}</fieldValue>
          <paramClause>EQUAL</paramClause>
          <boost>0.9</boost>
        </searchParam>`;
      }

      if (sortDescending) {
        sortCriteria = `<sortCriteriaList>
          <sortCriteria>
            <fieldName>com.cisco.vportal.1.addedDate</fieldName>
            <sortingOrder>DESCENDING</sortingOrder>
            <sortingPriority>0.1</sortingPriority>
          </sortCriteria>
        </sortCriteriaList>`;
      }

      body = `<vp:vpcontentsearch xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
            <locale>en_US</locale>
            <start>${pageStart}</start>
            <limit>${pageLimit}</limit>
            <contentType>VIDEO_PORTAL</contentType>
            <searchQuery>
              <searchText>${searchText}</searchText>
              <fields>
                <field>title</field>
                <field>description</field>
                <field>author</field>
                <field>com.cisco.vportal.1.tags</field>
              </fields>
              <searchParamList>
                <searchParam>
                  <fieldName>searchType</fieldName>
                  <fieldValue>content/composite/vp</fieldValue>
                  <paramClause>EQUAL</paramClause>
                  <boost>0.9</boost>
                </searchParam>
                <searchParam>
                  <fieldName>contentState</fieldName>
                  <fieldValue>PUBLISHED</fieldValue>
                  <paramClause>EQUAL</paramClause>
                  <boost>0.9</boost>
                </searchParam>
                ${author}
              </searchParamList>
              ${sortCriteria}
              <queryRangeList/>
            </searchQuery>
            <contentGroupId>${categoryPath}</contentGroupId>
          </vp:vpcontentsearch>`;

      return this.makeRequest('searchContent', body, undefined, options);
    },

    // TODO: not sure if this will ever throw error, because some requests don't specify state
    content: {
      single: (contentID) => {
        if (!contentID) { throw 'missing contentID'; }
        let contentState = 'PUBLISHED';

        var body =
                `<vp:vpcontent xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
                  <id>
                    <ccsid>${contentID}</ccsid>
                  </id>
                  <state>
                    <contentstate>${contentState}</contentstate>
                  </state>
                </vp:vpcontent>`;

          return this.makeRequest('getContentByIdAndState', body);
      },
      page: (pageNumber = 1, options = {}) => {
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || 1;
        }

        return this.search({}, pageNumber, options);
      },
      categories: (contentID, pageNumber, options) => {
        if (!contentID) { throw 'missing contentID'; }

        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || undefined;
        }

        var body =
          `<vp:vpcontent xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
              <id>
                <ccsid>${contentID}</ccsid>
              </id>
            </vp:vpcontent>`;
        return this.makeRequest('getContentGroupsContainingContent', body, pageNumber, options);
      },
      comments: (contentID, commentType = 'BASIC', pageNumber = 1, options = {}) => {
        if (!contentID) { throw 'missing contentID'; }

        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || 1;
        }

        var body =
          `<vp:vpcontent xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
            <id>
              <ccsid>${contentID}</ccsid>
            </id>
            <state>
              <contentstate/>
            </state>
            <comment>
              <vpbasicComment>
                <commentId/>
                <commentText/>
              </vpbasicComment>
            </comment>
          </vp:vpcontent>
          <filterBy>
            <filter>${commentType}</filter>
          </filterBy>`;
        return this.makeRequest('getAllCommentsByContent', body, pageNumber, options);
      },
      basicComments: (contentID, pageNumber, options) => {
        return this.content.comments(contentID, 'BASIC', pageNumber, options);
      },
      timelineComments: (contentID, pageNumber, options) => {
        return this.content.comments(contentID, 'TIMELINE', pageNumber, options);
      },
      // who can see content -- only returns ids not full objects
      viewership: (contentID, pageNumber, options) => {
        if (!contentID) { throw 'missing contentID'; }
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || undefined;
        }

        var body =
          `<vp:vpcontent xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
            <id>
              <ccsid>${contentID}</ccsid>
            </id>
          </vp:vpcontent>`;

        return this.makeRequest('getSavedContentViewership', body, pageNumber, options);

      },
      /* viewership only returns the ids of usergroups, and returns in nonstandard
       * formatting (usergroup instead of vpusergroup).
       * this function wraps viewership with an additional lookup
       * of the full user details.  It includes some hacky code to shoehorn
       * the full usergroup data into the viewership format
       */
      usergroups: (contentID, pageNumber, options) => {
        if (!contentID) { throw 'missing contentID'; }
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || undefined;
        }

        // generator function to make multiple promises easier to work with
        let request = Q.async(function* () {
          var body;

          // get viewership (ids)
          let viewersRequest = this.content.viewership(contentID, pageNumber, options);
          yield viewersRequest;

          let viewershipRecords = viewersRequest.inspect().value;
          let groupIds = $js.match('.viewers > .usergroup .id', viewershipRecords);

          // if no usergroup matches then just return
          if (_.isEmpty(groupIds)) {
            return yield viewersRequest;
          }

          body = _.map(groupIds, (id) => {
              return `<vpusergroup><id>${id}</id></vpusergroup>`;
            }).join('');

          let groupsPromise = this.makeRequest('getUserGroupListByGroupIdList', body, pageNumber, options);

          yield groupsPromise;

          let groupResponse = groupsPromise.inspect().value;
          let groupDetails = $js.match('.vpusergroup', groupResponse)[0];

          let output = _.merge({}, viewershipRecords, {
            vpcontent: { viewers: { usergroup: groupDetails } }
          });

          return yield Q.resolve(output);

        }).call(this);
        return request;

      }
    },
    category: {
      page: (pageNumber, options) => {
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || undefined;
        }

        // TODO: do we need to support API versions < the latest? that could cause drama because I think there's only getPublicCategories for earlier versions
        return this.makeRequest('getCategories', '', undefined, options);
      },
      content: (path, pageNumber, options) => {
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || undefined;
        }
        return this.search({category: path}, pageNumber, options);
      },
    },
    user: {
      single: (username) => {
        if (!username) { throw 'missing username'; }

        var body =
          `<vp:vpuser xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
            <username>${username}</username>
          </vp:vpuser>`;
        return this.makeRequest('getUserDetailsByUserName', body);
      },
      // i'm not setting default values for offset here, becasue no params will just get all
      page: (pageNumber = 1, options = {}) => {
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || 1;
        }

        return this.makeRequest('getUserDetails', '', pageNumber, options);
      },
      content: (username, pageNumber, options) => {
        return this.search({author: username}, pageNumber, options);
      }
    },
    usergroup: {
      single: (groupID) => {
        if (!groupID) { throw 'missing group id'; }

        var body =
          `<vpusergroup xmlns:vp="http://model.data.core.vportal.cisco.com/vp_ns">
            <id>${groupID}</id>
          </vpusergroup>`;
        return this.makeRequest('getUserGroupListByGroupIdList', body);
      },
      page: (pageNumber = 1, options = {}) => {
        if (_.isObject(pageNumber)) {
          options = pageNumber;
          pageNumber = options.page || options.pageNumber || 1;
        }

        return this.makeRequest('getAllGroups', '', pageNumber, options);
      }
    }
  });

}

_.extend(CiscoRequest.prototype, {
  defaults: {
      username: undefined,
      password: undefined,
      proxy: undefined,
      userAgent: CISCO_SAMPLEAPP_USERAGENT,
      portalID: 1,
      pageSize: 20,
      maxResults: 65536,
      sortDescending: false,
      callbacks: {
        beforeSend: undefined,
        beforeParse: undefined,
        afterParse: undefined
      },
      // these options clean up cisco api into plain-jane js-friendly key/value responses
      parserOptions: {
        explicitRoot: false,
        ignoreAttrs: true,
        stripPrefix: true,
        xmlns: false,
        explicitArray: false,
        // remove all namespaces (i.e. vp:response becomes response)
        tagNameProcessors: [function (name) {
          return name.replace(/^[^:]*:/, '');
        }]
      }
  }
});


module.exports = CiscoRequest;
