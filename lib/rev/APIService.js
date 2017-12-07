'use babel';
'use strict';


var Q = require('q'),
    _ = require('lodash'),
    _private = require('../util/private-store').create(),
		moment = require('moment');

class ApiService {
	constructor (revConnection)  {
		var $resource = revConnection.resource;

		// store private variablese
		_private(this, {
			rev: revConnection,
			dispatchCommand: revConnection.dispatchCommand,
			videoEditResource: $resource('/media/videos/:videoId/edit'),
			videoPlaybackResource: $resource('/media/videos/:videoId'),
			videoPlaybackEmbedResource: $resource('/media/videos/:videoId/embed'),
			categoryResource: $resource('/media/accounts/:accountId/categories')

		});
	}
}
