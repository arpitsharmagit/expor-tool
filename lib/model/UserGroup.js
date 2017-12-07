'use babel';
'use strict';

var ModelBase = require('./ModelBase'),
    helpers, schema;

helpers = {
	testEqualTo: function (testValue) {
		return function (val) { return val == testValue; };
	},
	toInteger: function (val) {
		return parseInt(val, 10);
	}
};


schema = {
  vendorId: {
    require: true,
    selector: '> .id',
    transform: helpers.toInteger
  },
  name: {
    selector: '> .name',
    revKey: 'name'
  },
  collectionId: {
    revKey: 'collectionId'
  },
  groups: {
    revKey: 'groupIds'
  },
  users: {
    revKey: 'userIds'
  },
  description: {
    selector: '> .description',
    revKey: 'description'
  },
  parentGroupId: {
    selector: '> .parentGroupId',
    transform: helpers.toInteger
  },
  userCount: {
    selector: '> .userCount',
    transform: helpers.toInteger
  },
  isShareable: {
    selector: '> .isShareable',
    transform: helpers.testEqualTo('true')
  },
  createdBy: {
    selector: '> .createdBy'
  }
};



// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?
class UserGroup extends ModelBase {
  constructor (data) {
    super(data);

  }

  static get className () {
    return 'UserGroup';
  }
  static get vendorType () {
    return ['vpusergroup','usergroup'];
  }
  static get revType () {
    return 'collection';
  }
  static get schema () {
    return schema;
  }
}

UserGroup.register();

module.exports = UserGroup;
