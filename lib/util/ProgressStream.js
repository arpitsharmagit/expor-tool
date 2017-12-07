'use babel';
'use strict';


var stream = require('stream'),
    speedometer = require('speedometer'),
    _ = require('lodash');

class ProgressStream extends stream.Transform {
  constructor (options = {}) {
    super(options);

    this.settings = _.defaults({}, options, this.defaults);
    this.speed = speedometer(this.settings.speedWindow);
    this.startTime = Date.now();


    var stats = {
      percentage: 0,
  		transferred: this.settings.transferred,
  		length: this.settings.length,
  		remaining: this.settings.length,
  		eta: 0,
  		runtime: 0
    };

    this._update = this._update.bind(this, stats, this.settings.objectMode);
    let immediateUpdateStats = this.updateStats.bind(this, stats);
    this.updateStats = _.throttle(immediateUpdateStats, this.settings.interval);

    // on end immediately send progress event, and cancel pending
    this.on('end', () => {
      this.updateStats.cancel();
      immediateUpdateStats(true);
    });


    this.on('pipe', (src) => {

      _.each(src, (val, key) => {
        if (_.isString(val) || _.isNumber(val) && !(key in this)) {
          this[key] = val;
        }
      });

      if (_.isNumber(src.length)) {
        this.length = src.length;
      } else if (_.isObject(src.headers) && !isNaN(src.headers['content-length'])) {
        this.lenth = parseInt(src.headers['content-length']);
      }

      src.on('response', (res) => {
        if (!res || !res.headers) { return; }
    		if (res.headers['content-encoding'] === 'gzip') { return; }
    		if (res.headers['content-length']) {
    			this.length = parseInt(res.headers['content-length']);
    		}
      });

    });

    Object.defineProperty(this, 'length', {
      get: () => this.settings.length,
      set: (val) => {
        this.settings.length = val;
        stats.length = val;
        this.emit('length', val);
      },
      enumerable: true
    });

  }
  updateStats(stats, ended) {

    stats.percentage = ended ? 100 : (stats.length ? stats.transferred/stats.length*100 : 0);
    stats.speed = this.speed(0);
    stats.eta = Math.round(stats.remaining / stats.speed);
    stats.runtime = parseInt((Date.now() - this.startTime)/1000);
		this.emit('progress', stats);
  }
  _update(stats, objectMode, data) {
    var len = objectMode ? 1 : data.length,
        transferred = stats.transferred += len;
    stats.transferred = transferred;
    stats.remaining = stats.length >= transferred ? stats.length - transferred : 0;
    this.speed(len);

    this.updateStats(false);

  }
  _transform (data, encoding, callback) {

    this._update(data);

    this.push(data);
    callback();
  }
  _flush (callback) {
    this.updateStats(true);

    callback();
  }
  get defaults () {
    return {
      interval: 1000,
      length: 0,
      transferred: 0,
      speedWindow: 5000
    };
  }
}

module.exports = ProgressStream;
