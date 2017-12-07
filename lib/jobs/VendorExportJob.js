'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    _private = require('../util/private-store').create(),
    Task = require('../tasks/Task');

_.mixin(require('../util/lodashMixins'));

class VendorExportJob extends Task {
  constructor (migrate, taskLabel = 'vendor-export') {
    super({ label: taskLabel });

    var {sns, db} = migrate;

    _private(this, {
      migrate: migrate,
      sns: migrate.sns,
      db: migrate.db,
      cancelRequestedFlag: false,
      continueOnError: migrate.config.options.continueOnError
    });

    let contentEventListeners = [
      //  label: 'Content'
      (content) => {
        try {
          db.upsert('content', _.pick(content, 'vendorId'), content);
          this.emit('data', 'content', content);
        } catch (err) {
          let msg = { domain: 'content', data: content.title, error: err };
          this.addIssue(msg);
        }
      },
      // label: 'Category'
      /*(content) => {
        if (content.categories) {
          _.each(_.bubble(content.categories), (category) => {
            let existingCategory = db.get('category', { page: category.path });
            if (existingCategory) {
              this.emit('category');
            }
          });
          //this.emit('category')
        }
      }*/
      //label: 'Author',
      (content) => {
        var username;

        if (!content.author) { return; }

        username = content.author;

        let existingUser = db.get('user', { username: username });
        if (existingUser) { return; }

        sns.getUser(username)
          .then( (user) => {
            db.insert('user', user);
            this.emit('user', user);
            this.emit('data', 'user', user);
          })
          .catch( (err) => {
            let msg = { domain: 'user', data: username, error: err };
            this.addIssue(msg);
          })
          .done();
      },
        //label: 'User Group'
      (content) => {
        if (!content.usergroups) { return; }

        _.each(_.bubble(content.usergroups), (team) => {
          if (!team) return;

          let existingGroup = db.get('team', { vendorId: team.vendorId });
          if (existingGroup) { return; }

          sns.getUserGroup(team.vendorId)
            .then( (teamDetails) => {
              db.insert('team', teamDetails);
              this.emit('team', teamDetails);
              this.emit('data', 'team', teamDetails);
            })
            .catch( (err) => {
              let msg = { domain: 'team', data: team.name, error: err };
              this.addIssue(msg);
            })
            .done();
        });
      }
    ];
    _.each(contentEventListeners, (listener) => {
      this.on('content', listener);
    });

  }
  start () {
    super.start();
    var context = _private(this),
        { sns, db } = context;

    // reset cancel
    context.cancelRequestedFlag = false;

    // get categories
    // get content
    return Q.async(function* () {
      try {
        let p = sns.getTotalContentCount(),
            totalCount = yield p;

        this.emit('info', '' + totalCount + ' contents in SnS');
        this.statistics.totalCount = totalCount;

        p = this.exportCategories();
        yield p;
        this.emit('info', 'got categories');
        p = this.exportContent();
        yield p;

        this.statistics.index = this.statistics.total;

        this.emit('info', 'got content');
        p = db.save();
        yield p;

        this.emit('info', 'saved');
        return yield this.end();
      } catch (err) {
        return yield this.fail(err);
      }

    }).call(this);
  }
  cancel () {
    _private(this).cancelRequestedFlag = true;
    return this.promise;
  }
  exportCategories () {
    var { sns, db } = _private(this);
    return sns.getCategories().then( (categories) => {
      _.each(categories, (category) => {
        db.upsert('category', _.pick(category, 'path'), category);
      });
      db.save('category');
      this.emit('categories', categories);
      this.emit('data', 'categories', categories);
      return categories;
    });

  }
  exportContent () {
    var {sns, db, continueOnError } = _private(this),
        pageSize = sns.config.pageSize;

    return sns.getContentsDetailed( (content, page, index, total) => {
      let cancelRequestedFlag = _private(this).cancelRequestedFlag;
      if (cancelRequestedFlag) {
        return Q.reject('get contents cancelled');
      }

      try {
        if (content.issues) {
          this.addIssue({ domain: 'content:details', error: 'get details failures', id: content.vendorId, data: content.issues });
          return undefined;
        } else {
          // all save, etc handlers are tied to this event

          setImmediate( () => this.emit('content', content) );
        }
        // send status update
        this.notify({ progress: index / total, index: index, total: total, pageSize: pageSize, current: content.title });

        // save database every page
        // I put this outside loop to avoid big delays on saving...db.save should queue subsequent saves if necessary
        if (index % pageSize === 0) {
          setImmediate( () => {
            try {
              db.save();
              this.emit('info', 'saved page', index);
            } catch (err) {
              let msg = { domain: 'export', data: 'db save error', error: err };
              this.addIssue(msg);
              this.emit('warn', msg);
              if (!continueOnError) this.cancel();
            }

          });
        }

      } catch (err) {
        let msg = { id: content.vendorId, domain: 'export', data: content.toJSON(), error: err };
        this.addIssue(msg);
        if (!continueOnError) return Q.reject(err);
        return undefined;
      }

    });

  }
}

module.exports = VendorExportJob;
