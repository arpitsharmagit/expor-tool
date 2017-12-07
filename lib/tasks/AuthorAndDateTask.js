'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    Task = require('./Task'),
    Logger = require('../util/Logger'),
    store = require('../util/global-store'),
    log = new Logger('author');

_.mixin(require('../util/lodashMixins'));

class AuthorAndDateTask extends Task {
  constructor (...args) {
    super(...args);
  }
  start (rev, options = {}) {
    super.start();

    if (!this.content) {
      throw new Error('Author and Date Task not bound to content');
    }

    var content = this.content,
        videoId = content.videoId,
        author = content.author,
        whenUploaded = content.whenUploaded;

    let promise = Q.async(function* () {

      let defaultAuthor = store.get('config.options.defaultAuthor'),
          user = store.get('db').get('user', { username: author });

      if (!user || !user.userId) {
        log.warn('user not found in database, checking rev');
        try {
          let p = rev.user.getUserByUsername(author),
              revUser = yield p;

          if (revUser) {
            log.debug('found user in rev', author);
            if (user) {
              user.userId = revUser.id;
            }
          } else {
            log.debug('user not found in rev, using default');
            author = defaultAuthor;
          }
        } catch (err) {
          log.error('Error querying Rev for user, using default', err);
          author = defaultAuthor;
        }
      // user is not already known as in rev
      }

      let p = rev.media.setAuthorAndUploadDate(videoId, author, whenUploaded);
      yield p;
      return yield this.content;
    }).call(this);

    return promise
      .then(this.end.bind(this))
      .catch(this.fail.bind(this));
  }
}

module.exports = AuthorAndDateTask;
