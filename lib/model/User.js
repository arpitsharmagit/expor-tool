'use babel';
'use strict';

var ModelBase = require('./ModelBase');

var schema = {
  username: {
    required: true,
    selector: '> .username',
    revKey: 'username'
  },
  firstname: {
    selector: '> .firstname',
    revKey: 'firstName'
  },
  lastname: {
    selector: '> .lastname',
    revKey: 'lastName'
  },
  email: {
    required: true,
    selector: '> .useremail',
    revKey: 'email'
  },
  company: {
    selector: '> .usercompany'
  },
  title: {
    revKey: 'title'
  },
  phone: {
    selector: '> .userphone',
    revKey: 'phone'
  },
  language: {
    selector: '> .userlocale',
    revKey: 'language',
    transform: function (value) {
      // TODO language/locale tranform not implemented
      return value;
    }
  },
  ciscoUserID: {
    required: true,
    selector: '> .userid'
  },
  ciscoRoles: {
    type: 'object',
    selector: '> .assignedRoles > object > .roleDef'
  },
  userId: {
    revKey: 'id'
  },
  inboxId: {
    revKey: 'inboxId'
  },
  roles: {
    revKey: 'roleIds'
  }
};

// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?
class User extends ModelBase {
  constructor (data) {
    super(data);

  }

  static get className () {
    return 'User';
  }
  static get vendorType () {
    return 'vpuser';
  }
  static get revType () {
    return 'user';
  }
  static get schema () {
    return schema;
  }
}

// register model type with ModelBase registry
User.register();

module.exports = User;
