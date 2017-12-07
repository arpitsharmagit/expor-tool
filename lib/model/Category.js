'use babel';
'use strict';

var ModelBase = require('./ModelBase');

const ROOT_PATH = '/dms/core/contentcatalog/vportal/1';
const ROOT_PATH_REGEX = new RegExp(ROOT_PATH + '\/?$');

var schema = {
  name: {
    require: true,
    selector: '> .name',
    revKey: 'name'
  },
  categoryId: {
    revKey: 'categoryId'
  },
  parentCategoryId: {
    revKey: 'parentCategoryId'
  },
  path: {
    selector: '> .path',
    revKey: 'fullPath',
    revTransform: function (value) {
      return (value || '').replace(ROOT_PATH + '/', '');
    }
  },
  parentpath: {
    selector: '> .parentpath',
    optional: true
  },
  ciscoCategoryId: {
    selector: '> .categoryid',
    optional: true
  },
  children: {
    __model: 'Category',
    optional: true,
    type: 'object',
    associationType: 'hasMany',
    name: 'Children',
    selector: '> .child',
    transform: function (value) {
      var ThisClass = this;
      if (!Array.isArray(value)) {
        value = [value];
      }

      return value.map(ThisClass.fromVendorObject.bind(this));

    }
  }
};


// TODO: this assumes data's either coming from db or Cisco.  Do I need a method of detecting Rev data for import?
class Category extends ModelBase {
  constructor (data) {
    super(data);

  }

  // categories are returned nested from Cisco, so this gets them as flat array
  flatten () {
    var result = [this];

    if (this.children) {
      let flatChildren = this.children.reduce( (aggregate, child) => {
        return [].concat(aggregate, child.flatten.call(child));
      });
      result = result.concat(flatChildren);
    }

    return result;
  }
  // root category has no parent
  get isRootCategory () {
    return Category.isRootCategoryCheck(this.path);
  }
  // root will only have slash at end
  static isRootCategoryCheck (path) {
    return ROOT_PATH_REGEX.test(path);
  }
  static get className () {
    return 'Category';
  }
  static get vendorType () {
    return 'vpcategory';
  }
  static get revType () {
    return 'category';
  }
  static get schema () {
    return schema;
  }
}

Category.register();

module.exports = Category;

/*
  c = new Category({name: 'parent'});
  d = new Category({name: 'child'});
  c.datastore.save(log.log);
  c.datastore.addChild(d.datastore);

  c.datastore.save(log.log)

  c.datastore.getChildren(log.log)

*/
