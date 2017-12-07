'use babel';
'use strict';

var ModelBase = require('./ModelBase'),
    helpers, schema;


schema = {
  mediaContentId: {
    revKey: 'id'
  },
  title: {
    revKey: 'title'
  },
  relativeFilePath: {
    required: true,
    selector: '> .relativefilepath'
  },
  videoId: {
    type: 'string',
    revKey: 'videoId'
  },
  type: {
    type: 'string'
  }

};

class Attachment extends ModelBase {
  constructor (data) {
    super(data);

  }

  static get className () {
    return 'Attachment';
  }
  static get vendorType () {
    return ['attachment','transcriptasset'];
  }
  static get revType () {
    return 'mediaContent';
  }
  static get schema () {
    return schema;
  }
}

// register model type with ModelBase registry
Attachment.register();

module.exports = Attachment;
