"use strict";

const {EventEmitter} = require('events');
const {createServer} = require('net');
const dface = require('dface');
const {Server} = require('ws');

const VertexSocket = require('./VertexSocket');
const {VertexSocketIdleError} = require('./errors');

class VertexServer extends EventEmitter {


  static listen(config = {}) {
    return new Promise((resolve, reject) => {
      config.port = config.port || 65535;
      config.host = dface(config.host || '127.0.0.1');

      const server = new Server(config);
      const vertexServer = new VertexServer(server, config);

      const onError = error => {
        vertexServer.removeListener('listening', onListening);
        reject(error);
      };

      const onListening = () => {
        vertexServer.removeListener('error', onError);
        resolve(vertexServer);
      };

      vertexServer.once('error', onError);
      vertexServer.once('listening', onListening);
    });
  }


  constructor(server, config) {
    super();

    this._server = server;
    this._config = config;

    this._config.connectIdleTimeout = this._config.connectIdleTimeout || 20 * 1000;

    this._onErrorListener = this._onError.bind(this);
    this._onListeningListener = this._onListening.bind(this);
    this._onConnectionListener = this._onConnection.bind(this);
    // this._onHeadersListener = this._onHeaders.bind(this);

    server.on('error', this._onErrorListener);
    server.on('listening', this._onListeningListener);
    server.on('connection', this._onConnectionListener);
    // server.on('headers', this._onHeadersListener);

    config.socket = config.socket || {};
  }


  address() {
    return this._server._server.address();
  }


  close() {
    var _this = this;
    return new Promise((resolve, reject) => {
      if (_this._server) {
        _this._server.removeListener('listening', _this._onListeningListener);
        _this._server.removeListener('connection', _this._onConnectionListener);
        // _this._server.removeListener('headers', _this._onHeadersListener);
      }

      // ?? waits for clients to stop
      // _this._server._server.once('close', resolve);

      try {
        _this._server.close();
        resolve();
      } catch (error) {
        reject(error)
      } finally {
        _this._server.removeListener('errors', _this._onErrorListener);
        delete _this._server;
      }
    });
  }


  _onError(error) {
    this.emit('error', error);
  }


  _onListening() {
    this.emit('listening');
  }


  _onConnection(socket) {
    const vertexSocket = new VertexSocket(socket, this._config.socket);
    this.emit('connection', vertexSocket);

    if (this._config.connectIdleTimeout) {
      let timeout = setTimeout(() => {
        vertexSocket.terminate(new VertexSocketIdleError('Inactivity on connect'));
      }, this._config.connectIdleTimeout);

      vertexSocket.once('data', () => {
        clearTimeout(timeout);
      });
    }
  }


  // _onHeaders(headers) {
  //   this.emit('headers', headers);
  // }


  // _onClose() {
  //   // this.emit('close');
  // }

}

module.exports = VertexServer;
