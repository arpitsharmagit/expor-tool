'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    _private = require('../util/private-store').create(),
    Task = require('../tasks/Task'),
    Logger = require('../util/Logger'),
    log = new Logger('CategoryJob');

class CategoryJob extends Task {
  constructor (categories, taskLabel = 'categories') {
    super({ label: taskLabel });

    // change child categories to reference flat list instead
    this.categories = dedupeChildren(categories, 'path');

    _private(this, {});


  }
  start (migrate) {
    super.start();

    var categories = this.categories,
        rev = migrate.rev;

    _private(this, {
      rev: rev
    });


    let progress = 0, totalCategories = categories.length;
    this.notifyCategoryUpdated = (category) => {
      progress += 1;
      this.notify(progress / (totalCategories) );
    };

    var rootCategory = _.find(categories, _.property('isRootCategory'));

    // get existing, recursively add categories, then return flat category list
    return rev.category.getCategories()
      .then( (existingCategories) => {
        return this.syncCategories(rootCategory, existingCategories);
      })
      .then( () => this.categories)
      .then(this.end.bind(this))
      .catch(this.fail.bind(this));

  }
  syncCategories(rootCategory, existingCategories = []) {
    var rev = _private(this).rev,
        parentCategoryId = rootCategory.categoryId,
        categories = rootCategory.children;

    Q.async(function* () {


      for (let category of categories) {
        let existingCategory = null;

        // if categoryId is already defined then assume it's already existing
        if (category.categoryId) {
          existingCategory = _.find(existingCategories, { id: category.categoryId });
        } else {

          // match based on category name at given depth
          existingCategory = _.find(existingCategories, { name: category.name });

          if (existingCategory) {
            log.debug('updating category with existing data', category, existingCategory);
            // exists, so update datastore record
            category.categoryId = existingCategory.id;
            category.parentCategoryId = existingCategory.parentCategoryId;
          } else {
            // else create
            log.debug('adding new category', category.name, 'in', rootCategory.name);
            try {
              category.parentCategoryId = parentCategoryId;

              let metadata = _.pick(category, ['name', 'parentCategoryId']),
                  p = rev.category.createCategory(metadata);

              category.categoryId = yield p;
            } catch (err) {
              log.error('Error creating category', err);
              this.issues.push({
                category: category.path,
                error: err
              });
            }
          }
        }
        this.notifyCategoryUpdated(category);

        // then update children -- make sure categoryId, which = no error
        if (category.categoryId && category.children) {
          let p = this.syncCategories(category, existingCategory && existingCategory.children);
          yield p;
        }

      }

      return yield this.promise;

    }).call(this);
  }
}

function dedupeChildren(categories, matchKey = 'path') {
  _.each(categories, (rootCategory) => {
    if (rootCategory.children) {
      rootCategory.children = _.map(rootCategory.children, (child) => {
        let match = _.find(categories, _.pick(child, matchKey));
        if (!match) {
          log.warn('orphan child!', child);
          categories.push(child);
          return child;
        } else {
          return match;
        }
      });
    }
  });
  return categories;
}

module.exports = CategoryJob;
