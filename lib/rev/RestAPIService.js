'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    crypto = require('crypto'),
    moment = require('moment'),
    restify = require('restify');

class RestAPIService {
  constructor (baseUrl, opts = {}) {
    if (_.isObject(baseUrl)) {
      opts = baseUrl;
      baseUrl = opts.url;
    }

    this.key = opts.key;
    this.secret = opts.secret;

    var client = restify.createJsonClient({
      url: baseUrl
    });

  }
  authorize (key = this.key, secret = this.secret) {

    var timeStamp = moment.utc().format('M/D/YYYY h:m:s A');

    // create encoded signature hmac sha 256
    let hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${apiKey}:${timeStamp}`);

    let signature = hmac.digest('base64');

    let options = {
      headers: {
        'ApiAuthorization': `${apiKey}::${timeStamp}::${signature}`
      }
    };

    return this.makeRequest('POST', '/api/v1/auth', {}, options)
      .then((result) => {
        this.setToken(result.authorization);
      })
      .catch((err) => {
        return err;
      });

  }

}
    baseUrl = 'http://ls-rev';
    var secret = 'p1HhSKP5MY5oK/y2WdEpaQfwvciHUgF8VHk29CF/jykhUPPtmHkTXEzeYaRDiEq5gEj+HRMo4OHkVzVDkJ56l9ctRTe2V1/+8i3kVYSW9xZABUC99jtZTfPnbJul6sYShDL4rJQaDUctlZQr/pp1O/tpnTz51e7DMcGMkOR9C4k=';
    var apiKey = 'password';

    Doug0528:6/2/2015 7:52:00 PM
    Doug0528 is my API key
    if you want hit this server which has my API key
    baseUrl = 'http://qa-w12-avg-06.lab.vb.loc/api/'

    timeStamp = '6/2/2015 7:52:00 PM';
    apiKey = 'Doug0528';
    secret = 'L2tKaJbeB8u6PC+vwkfJIPlcykN+t9mGPopXNcKL0v/aGDgyZkeZSKWhqWhvqywLRP/NrrtuijT+yhhqsdYvSgH35vYgY80ShySTNSnOJK+/A9fNp1Yv0Y4my7bNEJX+zKQMCHd6MGJy00sESNPrTWrS+ZKoAlLBY683nU5nZ9I='

    shouldBe = 'Q3pd0rHVAe3NfbmI6MiKjs8dfRIyrdjBLNy4JBkEODM='

    rs = new RestService(baseUrl)


rs = new RestService('http://ls-rev/')

 the s
videoId = 'fdbb344a-56e8-4dd3-b09c-f8ccc60024ab'
userName = 'katyah.ling';

rest.makeRequest('PUT', '/api/v1/videos/' + videoId + '/migration', {
  UserName: 'robotasdf',
  whenUploaded: "2015-06-02T17:22:10.107Z"
}).then(console.log.bind(console), console.warn.bind(console))

"2015-06-02T17:22:10.107Z"
"2015-06-02T13:22:10.107Z"

let options = {
  beforeSend: (req, d) => {
    global.req = req;
    console.log(req, d);
  },
  headers: {
    'ApiAuthorization': headerValue
  }
};
p = rs.makeRequest('POST', '/api/v1/auth', {}, options);
