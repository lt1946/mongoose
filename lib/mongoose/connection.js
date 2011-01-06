
/**
 * Module dependencies.
 */

var url = require('url')
  , utils = require('./utils')
  , EventEmitter = utils.EventEmitter
  , driver = global.MONGOOSE_DRIVER_PATH || './drivers/node-mongodb-native'
  , Collection  = require(driver + '/collection');

/**
 * Connection constructor. For practical reasons, a Connection equals a Db
 *
 * @param {Mongoose} mongoose base
 * @api public
 */

function Connection (base) {
  this.base = base;
  this.collections = {};
  this.models = {};
};

/**
 * Inherit from EventEmitter.
 *
 */

Connection.prototype.__proto__ = EventEmitter.prototype;

/**
 * Connection ready state:
 *  0 = Disconnected
 *  1 = Connected
 *  2 = Connecting
 *  3 = Disconnecting
 *
 * @api public
 */

Connection.prototype.readyState = 0;

/**
 * A hash of the collections associated with this connection
 *
 * @param text
 */

Connection.prototype.collections;

/**
 * The mongodb.Db instance, set when the connection is opened
 *
 * @api public
 */

Connection.prototype.db;

/**
 * Establishes the connection
 *
 * @param {String} mongodb://uri
 * @return {Connection} self
 * @api public
 */

Connection.prototype.open = function (host, database, port, callback) {
  var self = this, uri;

  // if we've been supplied an uri
  if (typeof database != 'string'){
    uri = url.parse(host);
    host = uri.hostname;
    port = uri.port || 27017;
    callback = database;
    database = uri.pathname.replace(/\//g, '');
  } else {
    callback = callback || port;
    port = typeof port == 'number' ? port : 27017;
  }
  
  // make sure we can open
  if (this.readyState != 0){
    if (typeof callback == 'function')
      callback(new Error('Trying to open unclosed connection'));
    return this;
  }

  // handle authentication
  if (uri.auth){
    var auth = uri.auth.split(':');
    this.user = auth[0];
    this.pass = auth[1];
  } else 
    this.user = this.pass = undefined;
  
  if (!host)
    throw new Error('Please provide a valid hostname.');

  if (!database)
    throw new Error('Please provide a database to connect to.');

  this.name = database;
  this.host = host;
  this.port = port;

  // signal connecting
  this.readyState = 2;
  this.emit('opening');

  // open connection
  this.doOpen(function(err){
    if (err) {
      if (typeof callback == 'function') callback(err);
    } else {
      self.onOpen();
      if (typeof callback == 'function') callback(null);
    }
  });

  return this;
};

/**
 * Called when the connection is opened
 *
 * @api private
 */

Connection.prototype.onOpen = function () {
  this.readyState = 1;
  this.emit('open');
};

/**
 * Closes the connection
 *
 * @param {Function} optional callback
 * @return {Connection} self
 * @api public
 */

Connection.prototype.close = function (callback) {
  var self = this;

  if (this.readyState == 1){
    this.readyState = 3;
    this.doClose(function(err){
      if (err){
        if (callback) callback(err);
      } else {
        self.onClose();
        if (callback) callback(null);
      }
    });
  } else if (callback)
    callback(new Error('Trying to close unopened connection'));

  return this;
};

/**
 * Called when the connection closes
 *
 * @api private
 */

Connection.prototype.onClose = function () {
  this.readyState = 0;
  this.emit('close');
};

/**
 * Retrieves a collection, creating it if not cached.
 *
 * @param {String} collection name
 * @return {Collection} collection instance
 * @api public
 */

Connection.prototype.collection = function (name) {
  if (!(name in this.collections))
    this.collections[name] = new Collection(name, this);
  return this.collections[name];
};

/**
 * Model accessor / precompiler 
 *
 * @param {String} model name
 * @return {Model} model instance
 * @api public
 */

Connection.prototype.model = function (name) {
  if (name in this.models)
    return this.models[name];

  var orig = this.base.models[name];

  function model () {
    orig.apply(this, arguments);
  };
  model.prototype.__proto__ = this.base.models[name];
  model.prototype.db = this;
  utils.copyStatics(orig, model);

  this.models[name] = model;

  return model;
};

/**
 * Module exports.
 */

module.exports = Connection;