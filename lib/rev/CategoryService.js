'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    _private = require('../util/private-store').create(),
    SearchService = require('./SearchService');

class CategoryService {

  constructor (revConnection) {
    var $resource = revConnection.resource;

    _private(this, {
      rev: revConnection,
      dispatchCommand: revConnection.dispatchCommand,
      rootCategoryContentResource: $resource('/media/categories/root-content'),
    	accountCategoriesResource: $resource('/media/accounts/:accountId/categories'),
    	accountCategoriesFlatResource: $resource('/media/accounts/:accountId/flattened-categories'),
    	categoryResource: $resource('/media/categories/:categoryId'),
    	categoryContentResource: $resource('/media/categories/:categoryId/content')

    });

  }
	getRootCategories () {
		return _private(this).rootCategoryContentResource.get();
	}

	getCategories (accountId = _private(this).rev.accountId) {
		return _private(this).accountCategoriesResource.get({accountId: accountId})
			.then( (response) => response.categories);
	}

	getFlattenedCategories (accountId = _private(this).rev.accountId) {
		return _private(this).accountCategoriesFlatResource.get({accountId: accountId})
      .then( (response) => response.categories);
	}

	getCategory (categoryId) {
		return _private(this).categoryResource.get({categoryId: categoryId});
	}

	getCategoryActiveSearchContent (accountId = _private(this).rev.accountId, categoryId = undefined) {
		return SearchService
			.getVideos({
				accountId: accountId,
				categoryPathIds: categoryId,
				status: 'active',
				ready: true,
				sortField: 'ThumbnailUri',
				count: 4,
				start: 0,
				uncategorized: !categoryId
			})
			.then( (result) => {
				return {
					thumbnailUris: _.pluck(result.videos, 'thumbnailUri'),
					videoCount: result.totalHits
				};
			});
	}

	getUncategorizedActiveSearchContent (accountId = _private(this).rev.accountId) {
		return this.getCategoryActiveSearchContent(accountId);
	}

	getCategoryContent (categoryId) {
		return _private(this).categoryContentResource.get({categoryId: categoryId});
	}

	createCategory (category) {
    let context = _private(this),
        rev = context.rev,
        accountId = rev.accountId,
        route = `${accountId}:Admin.Categories`;

    let CommandPromise = context.dispatchCommand("media:AddCategoryToAccount", {
    			accountId: category.accountId || context.rev.accountId,
    			name: category.name,
    			parentCategoryId: category.parentCategoryId
    		});

    let CreatedPromise = rev.router.addListener(route, 'CategoryCreated')
          .then( (result) => result.message.categoryId);

    CommandPromise.catch( (error) => {
      rev.router.removeListener(route, CreatedPromise);
    });

    return Q.all([CreatedPromise, CommandPromise]).then( (results) => {
      return results[0]; // categoryId
    });
	}

	saveCategory (category) {
    let context = _private(this);

		return context.dispatchCommand("media:SaveCategoryDetails", {
			accountId: category.accountId || context.rev.accountId,
			categoryId: category.id,
			name: category.name
		});
	}

	moveCategory  (category, destinationCategory) {
    let context = _private(this);

		return context.dispatchCommand('media:MoveCategory', {
			accountId: category.accountId || context.rev.accountId,
			categoryId: category.id,
			newParentCategoryId: destinationCategory && destinationCategory.id
		});
	}

	removeCategory (accountId, categoryId) {
    if (accountId && !categoryId) {
      categoryId = accountId;
      accountId = _private(this).rev.accountId;
    }

		return _private(this).dispatchCommand("media:RemoveCategory", {
			accountId: accountId,
			categoryId: categoryId
		});
	}

	/**
	 * Gives you the path of the category's parent. In other words, the path without the category itself at the end.
	 * @param  {Category} category
	 * @return {String}          The path with the category itself excluded. If there is no parent, an empty String is returned.
	 */
	getParentPath (category) {
		var fullPath = category.fullPath,
			name = category.name;

		if (name.length === fullPath.length) {
			return '';
		} else {
			return fullPath.substr(0, fullPath.lastIndexOf('/' + name));
		}
	}
}

module.exports = CategoryService;
