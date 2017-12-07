'use babel';
'use strict';

function isObject (val) {
  return (val === Object(val));
}

function storeBase (storage, context, newData) {
  if (!isObject(context)) {
      return undefined;
  }

  var data = storage.get(context);
  if (!data) {
    data = isObject(newData) ? newData : {};
    storage.set(context, data);
  } else if (isObject(newData)) {
    for (let key in newData) {
      data[key] = newData[key];
    }
    storage.set(context, data);
  }
  return data;
}

function createStorage (self) {
  var privateStore = new WeakMap(),
      store = storeBase.bind(self, privateStore);

  store.delete = (context) => privateStore.delete(context);
  store.clear = () => privateStore.clear();
  store.create = createStorage;

  return store;
}

module.exports = createStorage();

/*

var _private = require('private-store')

_private2 = _private.create();

function Foo (x) {
  _private(this, { privateVal: x });
  _private2(this, { privateVal: 'different store' })
}
Foo.prototype.getVal = function () {
  return _private(this).privateVal;
}
Foo.prototype.getVal2 = function () {
  return _private2(this).privateVal;
}

bar = new Foo('peekaboo');
bar.getVal();
bar.getVal2();

*/
