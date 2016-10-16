"use strict";

const {EventEmitter} = require('events');
const {createServer} = require('net');
const dface = require('dface');

const Socket = require('./socket');
const {property, getter} = require('./utils');

module.exports = class Server extends EventEmitter {

  static listen(config) {
    return new Promise((resolve, reject) => {
      const server = createServer();
      const wrapped = new Server(server);

      config = config || {};
      config.port = config.port || 0;
      config.host = dface(config.host || '127.0.0.1');

      wrapped.once('error', reject);

      wrapped.listen(config, () => {
        wrapped.removeListener('error', reject);
        resolve(wrapped);
      });
    });
  }

  constructor(server) {
    super();
    property(this, 'on', this.on, true);
    getter(this, 'server', server);

    server.on('error', this.onError.bind(this));
    server.on('listening', this.onListening.bind(this));
    server.on('connection', this.onConnection.bind(this));
    server.on('close', this.onClose.bind(this));
  }

  listen() {
    this.server.listen.apply(this.server, arguments);
  }

  address() {
    return this.server.address();
  }

  close() {
    const server = this.server;
    return new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.close();
    });
  }

  onError(error) {
    this.emit('error', error);
  }

  onListening() {
    this.emit('listening');
  }

  onConnection(socket) {
    this.emit('connection', new Socket(socket));
  }

  onClose() {
    this.emit('close');
  }

};
