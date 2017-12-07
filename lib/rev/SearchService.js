'use babel';
'use strict';


var _ = require('lodash'),
    _private = require('../util/private-store').create(),
    TimeUtil = require('../util/TimeUtil'),
    DateUtil = require('../util/DateUtil');


const searchItemTypes = {
  accessEntities: 'AccessEntity',
  //availableLdapGroups: 'AvailableLdapGroups',
  devices: 'Device',
  videos: 'Video'
};

const accessEntityTypes = {
  groups: 'Group',
  users: 'User'
};

const sortDirections = {
  asc: 'ASC',
  desc: 'DESC'
};

const maxDate = '9999-99-99T99:99:99Z';


class SearchService {
  constructor (revConnection) {
    var $resource = revConnection.resource;

    // store private variablese
    _private(this, {
      rev: revConnection,
      dispatchCommand: revConnection.dispatchCommand,
      searchResource: $resource('/search/accounts/:accountId/:itemType'),
      countResource: $resource('/search/accounts/:accountId/:itemType/count')
    });

    this.itemTypes = searchItemTypes;
		this.initialPageSize = 100;
		this.pageSize = 300;


  }

  search (itemType, searchParams = {}) {
		if (searchParams.cursorMark && searchParams.start) {
			throw new Error('SOLR cursor functionality requires start=0');
		}
    searchParams = _.defaults(searchParams, {
      sortField: '',
      accountId: _private(this).rev.accountId,
      cursorMark: '*'
    });

    if (_.has(searchParams, 'sortAscending')) {
      searchParams.sortDirection = searchParams.sortAscending ? sortDirections.asc : sortDirections.desc;
      delete searchParams.sortAscending;
    }

    return _private(this).searchResource.get({
			itemType: itemType,
			accountId: searchParams.accountId,
			q: searchParams.query,
			sortField: searchParams.sortField.toLowerCase() === 'score' ? '' : searchParams.sortField,
			sortDirection: searchParams.sortAscending ? sortDirections.asc : sortDirections.desc,
			count: searchParams.count || 100,
			start: searchParams.start || undefined,
			qf: searchParams.qf || undefined,
			cursorMark: searchParams.cursorMark,
			fl: searchParams.fl || undefined
		}).then( (result) => {
			return {
				totalHits: result.totalHits,
				hits: readSearchResult(result.hits),
				nextCursorMark: result.nextCursorMark
			};
		});
	}

	getDevices (searchParams) {
		return this.search(searchItemTypes.devices, searchParams)
			.then( (result) => {
				return {
					totalHits: result.totalHits,
					devices: result.hits
				};
			});
	}

	getUsers (searchParams) {
		searchParams.type = accessEntityTypes.users;

    return this.queryAccessEntities(searchParams)
			.then( (result) => {
				return {
					totalHits: result.totalHits,
					users: result.accessEntities,
					nextCursorMark: result.nextCursorMark
				};
			});
	}

	getGroups (searchParams) {
    searchParams.type = accessEntityTypes.groups;

		return this.queryAccessEntities(searchParams)
			.then( (result) => {
				return {
					totalHits: result.totalHits,
					groups: result.accessEntities,
					nextCursorMark: result.nextCursorMark
				};
			});
	}

	queryAccessEntities (searchParams) {
		searchParams.query = splitTerms(searchParams.query);

		if (searchParams.ids) {
			searchParams.query = appendValueListClause(searchParams.query, '_yz_rk', searchParams.ids);
		}

		if (searchParams.groupIds) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'GroupIds', searchParams.groupIds);
		}

		if(searchParams.type) {
			let appendFn = Array.isArray(searchParams.type) ? appendValueListClause : appendValueMatchClause;
			searchParams.query = appendFn(searchParams.query, 'Type', searchParams.type);
		}

		if(searchParams.sourceType) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'SourceType', searchParams.sourceType);
		}

		return this.search(searchItemTypes.accessEntities, searchParams)
			.then( (result) => {
				return {
					totalHits: result.totalHits,
					accessEntities: result.hits,
					nextCursorMark: result.nextCursorMark
				};
			});
	}
  /*
	getAvailableLdapGroups (searchParams) {

		searchParams.query = splitTerms(searchParams.query);

		if (searchParams.deviceId) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'DeviceId', searchParams.deviceId);
		}

		return this.search(searchItemTypes.availableLdapGroups, searchParams)
			.then( (result) => {
				return {
					totalHits: result.totalHits,
					availableLdapGroups: result.hits,
					nextCursorMark: result.nextCursorMark
				};
			});

	}
  */
	getVideos (searchParams) {

		var userId = _private(this).rev.userId;

		searchParams.query = formatQuery(searchParams.query);

		if(searchParams.uploaded){
			searchParams.query = appendDateRangeClause(searchParams.query, 'WhenUploaded', searchParams.uploaded);
		}

		if (searchParams.category) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'CategoryIds', searchParams.category);
		}

		if(searchParams.myUploads){
			searchParams.query = appendValueMatchClause(searchParams.query, 'UploaderUserId', userId);
		}

		if (searchParams.status) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'IsActive', searchParams.status === 'active');
		}

		if (searchParams.libraryId) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'Libraries', searchParams.libraryId);
		}

		if (searchParams.ready) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'Status', 'Ready');
		}

		if (searchParams.pendingApproval) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'ApprovalStatus', 'PendingApproval');
		}

		if (searchParams.approvalProcessTemplateIds) {
			searchParams.query = appendValueListClause(searchParams.query, 'ApprovalProcessTemplateId', searchParams.approvalProcessTemplateIds);
		}

		//must be the last filter applied
		//todo remove when search implements ACLs
		if (searchParams.myInactive) {
			var userInactiveVideosQuery = appendValueMatchClause(
											appendValueMatchClause(searchParams.query, 'UploaderUserId', userId),
											'IsActive',
											false);
			searchParams.query = appendOrClause(userInactiveVideosQuery,
												appendValueMatchClause(searchParams.query, 'IsActive', true));
		}

		if (searchParams.uncategorized) { //really prepending and sequence seems to matter for this one
			searchParams.query = appendValueMatchClause(searchParams.query, '-CategoryIds', '*', true);
		} else if (searchParams.categoryPathIds) {
			searchParams.query = appendValueMatchClause(searchParams.query, 'CategoryPathIds', searchParams.categoryPathIds);
		}

		if(searchParams.videoType) {
			if (searchParams.videoType.toLowerCase() === 'live') {
				searchParams.query = appendValueMatchClause(searchParams.query, 'IsLive', true);
			} else if (searchParams.videoType.toLowerCase() === 'vod') {
				searchParams.query = appendValueMatchClause(searchParams.query, 'IsLive', false);
			}
		}

		searchParams.qf = "Title^0.4 Description^0.2 CategoryNames^0.2 Tags^0.2";

		return this.search(searchItemTypes.videos, searchParams)
			.then( (result) => {
				return {
					totalHits: result.totalHits,
					videos: result.hits,
					nextCursorMark: result.nextCursorMark
				};
			});
	}

	getCount (accountId, itemType, query) {
    if (arguments.length === 2) {
      itemType = accountId;
      query = itemType;
      accountId = _private(this).rev.accountId;
    }
		return _private(this).countResource.get({itemType: itemType, accountId: accountId, q: query}).then( (result) => result.count);
	}
}



function readSearchResult (hits) {
	return _.map(hits, function(hit){
		var obj = {id: hit.id};

		_.each(hit.fields, (field) => {

			var name = _.camelCase(field.name);
			var value = field.value;

			switch (field.type) {
				case 'Date':
					value = TimeUtil.parseUTCDate(value);
					break;
				case 'TimeSpan':
					value = TimeUtil.parseCSharpTimespan(value);
					break;
				case 'Int':
					value = +value;
					break;
				case 'Double':
					value = +value;
					break;
				case 'Boolean':
					value = (value && value.toLowerCase() === 'true');
					break;
			}

			obj[name] = value;

		});

		return obj;
	});
}

function appendDateRangeClause (query, fieldName, dateRangeName) {

	var startDate, endDate;
	switch (dateRangeName) {
		case 'today':
			startDate = DateUtil.getToday();
			break;

		case 'yesterday':
			startDate = DateUtil.getYesterday();
			endDate = DateUtil.getToday();
			break;

		case 'thisWeek':
			startDate = DateUtil.getStartOfWeek();
			break;

		case 'thisMonth':
			startDate = DateUtil.getStartOfMonth();
			break;

		case 'thisYear':
			startDate = DateUtil.getStartOfYear();
			break;

		default:
			throw new Error("Unknown date range: " + dateRangeName);
	}

	endDate = endDate ? endDate.toISOString() : maxDate;

	return fieldName + ':[' + startDate.toISOString() + ' TO ' + endDate + ']' +
		( query ? ' AND (' + query + ')' : '');
}

function appendValueMatchClause (query, field, value, noQuotes) {
	var quote = noQuotes ? '' : '"';

	return field + ':' + quote + value + quote +
		(query ? ' AND ' + query : '');
}

function appendOrClause (query1, query2) {
	return '(' + query1 + ') OR (' + query2 + ')';
}

function appendValueListClause (query, field, values) {
	return field + ':' + '(' + values.join(' ') + ')' +
		(query ? ' AND ' + query : '');
}

function formatQuery (query) {
  return (query) ? query : '*';
}

function splitTerms (query) {
	if (!query) {
		return 'All:*';
	}

	// if the user put in quotes or ampersands, or if there are already boolean operators in the query, send it as is
	if (query.match(/\"|@|AND |NOT /)) {
		return query;
	}

	var starredTerms = query
		.replace(/-/g," ")
		.split(/\s/)
		.map(function(term) {
			return term + '*';
		});

	return 'All:(' + starredTerms.join(' AND ') + ')';
}

module.exports = SearchService;
