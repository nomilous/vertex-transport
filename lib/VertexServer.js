"use strict";

const {EventEmitter} = require('events');
const {createServer} = require('net');
const dface = require('dface');

const VertexSocket = require('./VertexSocket');
const {VertexSocketIdleError} = require('./errors');
const {property, getter} = require('./utils');

class VertexServer extends EventEmitter {

  static listen(config) {
    return new Promise((resolve, reject) => {
      config = config || {};
      config.port = config.port || 65535;
      config.host = dface(config.host || '127.0.0.1');

      const server = createServer();
      const vertexServer = new VertexServer(server, config);

      vertexServer.once('error', reject);

      vertexServer.listen(config, () => {
        vertexServer.removeListener('error', reject);
        resolve(vertexServer);
      });
    });
  }

  constructor(server, config) {
    super();
    property(this, 'on', this.on, true);
    getter(this, 'server', server);
    // getter(this, 'clients', {});

    this.config = config = config || {};

    config.connectIdleTimeout = config.connectIdleTimeout || 10 * 1000;

    config.socket = config.socket || {};
    config.socket.maxFrameSize = config.socket.maxFrameSize || 128 * 1024; // 128KB

    server.on('error', this._onError.bind(this));
    server.on('listening', this._onListening.bind(this));
    server.on('connection', this._onConnection.bind(this));
    server.on('close', this._onClose.bind(this));
  }

  listen() {
    this.server.listen.apply(this.server, arguments);
  }

  address() {
    return this.server.address();
  }

  close() {
    const server = this.server;
    // const clients = this.clients;
    //
    // Object.keys(clients).forEach(key => {
    //   clients[key].destroy();
    // });

    return new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.close();
    });
  }

  _onError(error) {
    this.emit('error', error);
  }

  _onListening() {
    this.emit('listening');
  }

  _onConnection(socket) {
    const vertexSocket = new VertexSocket(socket, this.config.socket);
    this.emit('connection', vertexSocket);

    // this.clients[1] = vertexSocket;

    if (this.config.connectIdleTimeout) {
      const timeout = setTimeout(() => {
        vertexSocket.destroy(new VertexSocketIdleError('Inactivity on connect'));
      }, this.config.connectIdleTimeout);

      vertexSocket.once('data', () => {
        clearTimeout(timeout);
      });
    }
  }

  _onClose() {
    this.emit('close');
  }

}

module.exports = VertexServer;
