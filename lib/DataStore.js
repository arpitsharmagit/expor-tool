'use babel';
'use strict';

var _ = require('lodash'),
    Q = require('q'),
    low = require('lowdb'),
    path = require('path'),
    fs = require('fs'),
    zlib = require('zlib'),
    EventEmitter = require('events').EventEmitter,
    model = require('./model');

_.mixin(require('./util/lodashMixins'));


var DEFAULT_CONFIG = {
  //folder: '.',
  allFilename: 'migrate-data.json',
  contentFilename: 'migrate-content.json',
  categoryFilename: 'migrate-category.json',
  teamsFilename: 'migrate-teams.json',
  jobsFilename: 'migrate-jobs.json',
  usersFilename: 'migrate-users.json',
  autosave: false,
  async: true
};

class DataStore extends EventEmitter {
  constructor (config = {}) {
    super();

    config = this.config = _.defaults(config, DEFAULT_CONFIG);

    let folder = config.folder;
    if (!folder || !fs.existsSync(folder)) {
      console.warn('save folder does not exist: ' + folder);
    } else {
      this.init();
    }

  }
  init (config = {}) {
    config = _.merge(this.config, config);

    let folder = config.folder;

    if (!fs.existsSync(folder)) {
      throw new Error('save folder does not exist: ' + folder);
    }

    let dbConfig = _.pick(config, ['autosave', 'async']);

    let buckets = {
      content: {
        filename: config.contentFilename,
        primaryKey: 'videoId'
      },
      category: {
        filename: config.categoryFilename,
        primaryKey: 'categoryId'
      },
      team: {
        filename: config.teamsFilename,
        primaryKey: 'collectionId'
      },
      user: {
        filename: config.usersFilename,
        primaryKey: 'userId'
      },
      job: {
        filename: config.jobsFilename,
        primaryKey: 'jobId'
      }
    };

    // already loaded
    if (this.buckets) {
      _.each(buckets, (cfg, name) => {
        let bucket = this.buckets[name];
        cfg.filepath = path.resolve(config.folder, cfg.filename);
        bucket.init(cfg, dbConfig);
      });
    } else {
      this.buckets = _.reduce(buckets, (result, cfg, name) => {
        cfg.filepath = path.resolve(config.folder, cfg.filename);
        cfg.name = name;
        let bucket = new Bucket(cfg, dbConfig);
        Object.defineProperty(this, name, {
          get: () => bucket.rows,
          set: (newArray) => bucket.store.object[bucket.name] = newArray,
          enumerable: true
        });
        result[name] = bucket;
        return result;
      }, {});
    }

    return Q.resolve(this);
  }
  save (bucketName) {
    try {
      if (bucketName) {
        this.buckets[bucketName].save();
      } else {
        _.invoke(this.buckets, 'save');
      }
      this.emit('save', bucketName);
      return Q.resolve();
    } catch (err) {
      return Q.reject(err);
    }
  }
  backup (bucketName = 'content', overwrite = true) {
    let filepath = this.buckets[bucketName].filepath,
        deferred = Q.defer(),
        gzip = zlib.createGzip();

    let infile = filepath.replace(/\.gz$/, ''),
        outfile = filepath + '.gz';

    if (!fs.existsSync(infile)) {
      return Q.reject('file not exist: ' + infile);
    }
    if (fs.existsSync(outfile)) {
      if (overwrite) {
        fs.unlinkSync(outfile);
      } else {
        return Q.reject('output file exists, not deleting: ' + outfile);
      }
    }

    let input = fs.createReadStream(infile),
        output = fs.createWriteStream(outfile);

    input.pipe(gzip).pipe(output);
    output.on('finish', deferred.resolve);
    output.on('error', deferred.reject);

    return deferred.promise;
  }
  restore (bucketName = 'content', overwrite = true) {
    let filepath = this.buckets[bucketName].filepath,
        deferred = Q.defer(),
        gunzip = zlib.createGunzip();

    let outfile = filepath.replace(/\.gz$/, ''),
        infile = filepath + '.gz';


    if (!fs.existsSync(infile)) {
      return Q.reject('file not exist: ' + infile);
    }
    if (fs.existsSync(outfile)) {
      if (overwrite) {
        fs.unlinkSync(outfile);
      } else {
        return Q.reject('output file exists, not deleting: ' + outfile);
      }
    }

    let input = fs.createReadStream(infile),
        output = fs.createWriteStream(outfile);

    input.pipe(gunzip).pipe(output);
    output.on('finish', deferred.resolve);
    output.on('error', deferred.reject);

    return deferred.promise;
  }
  erase () {
    console.warn('ERASING DATABASE FILES!');
    _.each(this.buckets, (bucket) => {
      try {
        if (fs.existsSync(bucket.filepath)) {
          fs.unlinkSync(bucket.filepath);
        }
      } catch (err) {
        console.error('error deleting file', bucket.filepath, err);
      }
    });
  }
  get (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.get.apply(b, args);
  }
  select (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.select.apply(b, args);
  }
  search (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.search.apply(b, args);
  }
  insert (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.insert.apply(b, args);
  }
  update (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.update.apply(b, args);
  }
  upsert (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.upsert.apply(b, args);
  }
  remove (bucket, ...args) {
    let b = this.buckets[bucket];
    return b.remove.apply(b, args);
  }
}

class Bucket {
  constructor (config, dbConfig) {
    this.store = low(config.filepath, dbConfig);
    this.primaryKey = config.primaryKey;
    this.name = config.name;
    this.filepath = config.filepath;
    this.init();

  }
  // transform contents to Models
  init (config, dbConfig) {
    if (config && config.filepath && config.filepath !== this.filepath) {

      // first save existing content to new dir before changing
      if (!_.isEmpty(this.store.object[this.name]) && !fs.existsSync(config.filepath)) {
        this.store.saveSync(config.filepath);
      }

      this.filepath = config.filepath;
      this.store = low(this.filepath, dbConfig);
    }

    let rows = this.rows,
        __model = rows.length && rows[0].__model;

    if (__model) {
      this.store.object[this.name] = _.map(rows, (record) => {
        return model(record);
      });
    }
  }
  get rows () {
    return (this.store.object || {})[this.name] || [];
  }
  get (predicate, key = this.primaryKey, shouldReturnMany = false) {
    let collection = this.store(this.name);

    if (!_.isObject(predicate)) {
      let val = predicate;
      predicate = _.matchesProperty(key, val);
    }
    return (shouldReturnMany) ? collection.filter(predicate) : collection.find(predicate);
  }
  find () { return this.get.apply(arguments); }
  select (predicate, key = this.primaryKey) {
    return this.get.call(this, predicate, key, true);
  }
  search (text = '', field = this.primaryKey, maxResults = Infinity) {
    let collection = this.store(this.name),
        predicate = (obj) => _.contains(obj[field], text);

    // allow _.where style searching { author: 'username' }
    if (_.startsWith(text, '{') && _.endsWith(text, '}')) {
      let parsed = _.attempt(JSON.parse, text);
      if (!_.isError(parsed)) predicate = parsed;
    }

    return _(collection).filter(predicate).take(maxResults).value();
  }
  insert (records) {
    let collection = this.store(this.name);
    return collection.push.apply(collection, [].concat(records) );
  }
  update (predicate, attrs) {
    let doc = this.get(predicate);
    if (doc) { _.extend(doc, attrs); }
    return doc;
  }
  upsert (predicate, records) {
    if (!records) {
      if (!_.isObject(predicate)) {
        throw new Error('invalid record: ' + predicate);
      }
      records = predicate;
      if (_.isArray(records)) {
        return _.map(records, this.upsert.bind(this));
      }
      predicate = records[this.primaryKey];
    }
    let existing = this.update(predicate, records);
    if (!existing) {
      return this.insert(records);
    } else {
      return existing;
    }

  }
  remove (predicate) {
    let collection = this.store(this.name);
    return collection.remove(predicate);
  }
  save (safe) {
    if (safe) {
      this.store.saveSync(this.filepath);
    } else {
      this.store.save(this.filepath);
    }
  }
  backup (filepath) {
    this.store.save(filepath);
  }
  commit () { return this.save.apply(arguments); }
}

module.exports = DataStore;

/*
  DataStore = require('./DataStore');
*/
