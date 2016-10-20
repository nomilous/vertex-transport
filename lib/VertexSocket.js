"use strict";

const {EventEmitter} = require('events');
const dface = require('dface');
const {format} = require('util');
const WebSocket = require('ws');

const errors = require('./errors');

console.log('TODO: separate reply');
console.log('TODO: nest replies into .data');

class VertexSocket extends EventEmitter {


  static connect(config = {}) {
    return new Promise((resolve, reject) => {

      config.port = config.port || 65535;
      config.host = dface(config.host) || '127.0.0.1';
      config.protocol = config.protocol || 'ws';

      const url = format('%s://%s:%s', config.protocol, config.host, config.port);
      const socket = new WebSocket(url, config.protocols, config.options);
      const vertexSocket = new VertexSocket(socket, config);

      const onError = error => {
        vertexSocket.removeListener('connected', onConnected);
        reject(error);
      };

      const onConnected = () => {
        vertexSocket.removeListener('error', onError);
        resolve(vertexSocket);
      };

      vertexSocket.once('error', onError);
      vertexSocket.once('connect', onConnected);
    });
  }


  constructor(socket, config = {}) {
    super();

    this._socket = socket;
    this._config = config;
    this._sequence = 0;
    this._waiting = {};

    this._onErrorListener = this._onError.bind(this);
    this._onOpenListener = this._onOpen.bind(this);
    this._onCloseListener = this._onClose.bind(this);
    this._onMessageListener = this._onMessage.bind(this);
    this._onPingListener = this._onPing.bind(this);
    this._onPongListener = this._onPong.bind(this);

    socket.on('error', this._onErrorListener);
    socket.on('open', this._onOpenListener);
    socket.on('close', this._onCloseListener);
    socket.on('message', this._onMessageListener);
    socket.on('ping', this._onPingListener);
    socket.on('pong', this._onPongListener);
  }


  address() {
    try {
      return this._socket._socket.address();
    } catch (e) {
      /* gone after the socket is closed */
    }
  }


  remoteAddress() {
    try {
      return {
        address: this._socket._socket.remoteAddress,
        family: this._socket._socket.remoteFamily,
        port: this._socket._socket.remotePort
      }
    } catch (e) {
      /* gone after the socket is closed */
    }
  }


  close(code = 1001, message = 'going away') {
    if (!this._socket) return;
    if (!code) code = 1001;
    this._socket.close(code, message);
  }


  terminate(error) {
    if (error) this.emit('error', error);
    this._socket.terminate();
  }


  pause() {
    // return this.socket.pause();
  }


  resume() {
    // return this.socket.resume();
  }


  send(data, timeout) {
    return new Promise((resolve, reject) => {

      if (!this._socket || this._socket.readyState != WebSocket.OPEN) {
        return reject(new errors.VertexSocketClosedError('Cannot write'));
      }

      const sequence = this._nextSequence();
      const ts = Date.now();
      const meta = {
        seq: sequence,
        ts: ts
      };

      let encoded;

      try {
        encoded = this._encode(data, meta);
      }

      catch (error) {
        return reject(error);
      }

      this._waiting[sequence] = {
        resolve: resolve,
        reject: reject,
        ts: ts
      };

      if (timeout && typeof timeout == 'number') {
        this._waiting[sequence].timeout = setTimeout(() => {
          this._waiting[sequence].reject(
            new errors.VertexSocketTimeoutError('Ack timeout', meta)
          );
          delete this._waiting[sequence];
        }, timeout);
      }

      this._socket.send(encoded);
      if (meta.buffer) this._socket.send(data);

    });
  }


  _onError(error) {
    this.emit('error', error);
  }


  _onOpen() {
    this.emit('connect');
  }


  _onClose(code, message) {
    if (code == 1003) this.emit('error', new errors.VertexSocketDataError(message));

    this.emit('close', code, message);

    if (!this._socket) return;

    this._socket.removeListener('error', this._onErrorListener);
    this._socket.removeListener('open', this._onOpenListener);
    this._socket.removeListener('close', this._onCloseListener);
    this._socket.removeListener('message', this._onMessageListener);
    this._socket.removeListener('ping', this._onPingListener);
    this._socket.removeListener('pong', this._onPongListener);

    delete this._socket;

    Object.keys(this._waiting).forEach(sequence => {
      clearTimeout(this._waiting[sequence].timeout);
      this._waiting[sequence].reject(
        new errors.VertexSocketClosedError('Closed while awaiting ack', {
          seq: parseInt(sequence),
          ts: this._waiting[sequence].ts
        })
      );
      delete this._waiting[sequence];
    });
  }


  _onMessage(message, detail) {
    let decoded;

    if (detail.binary) {
      decoded = {
        meta: this._waitingMeta,
        data: message
      };
      delete this._waitingMeta;
    }

    else {
      try {
        decoded = JSON.parse(message);
      }
      catch (error) {
        try {
          this.emit('error', new errors.VertexSocketDataError(error.toString(), this.remoteAddress()));
        }
        catch (e) {
          /* in case of no error handler */
        }
        this.close(1003, error.toString());
        return;
      }

      if (!decoded.meta || typeof decoded.meta.seq !== 'number') {
        try {
          this.emit('error', new errors.VertexSocketDataError('Missing meta', this.remoteAddress()));
        }
        catch (e) {
          /* in case of no error handler */
        }
        this.close(1003, 'Missing meta');
        return;
      }

      if (decoded.meta.ack || decoded.meta.nak) {
        if (!this._waiting[decoded.meta.seq]) {
          try {
            this.emit('error', new errors.VertexSocketLagError('Response after timeout', decoded.meta));
          }
          catch (e) {
            /* in case of no error handler */
          }
          return;
        }

        clearTimeout(this._waiting[decoded.meta.seq].timeout);

        if (decoded.meta.nak) {
          this._waiting[decoded.meta.seq].reject(this._format(decoded));
          delete this._waiting[decoded.meta.seq];
          return;
        }

        this._waiting[decoded.meta.seq].resolve(this._format(decoded));
        delete this._waiting[decoded.meta.seq];
        return;
      }

      if (decoded.meta.buffer) {
        this._waitingMeta = decoded.meta;
        return;
      }
    }

    let replies, tags = 0;
    let replyFn = (tag, promise) => {
      if (typeof promise == 'undefined') {
        promise = tag;
        tag = tags++;
      }
      replies = replies || {};
      replies[tag] = promise;
    };

    try {
      this.emit('data', decoded.data, decoded.meta, replyFn);
    }
    catch (error) {
      /* unhandled error in one of on('data') handlers, server will now crash, no ACK, no NAK */
      throw error;
    }

    delete decoded.data;

    if (!replies) {
      this._sendAck(decoded);
      return;
    }

    this._reply(replies)

      .then(replies => {
        Object.keys(replies).forEach(key => decoded[key] = replies[key]);
        if (decoded.nak) {
          return this._sendNak(decoded.meta, decoded.error || decoded.nak);
        }
        this._sendAck(decoded);
      })

      .catch(error => this._sendNak(decoded.meta, error))
  }


  _onPing() {

  }


  _onPong() {

  }


  // _onDrain() {
  //   this.emit('drain');
  // }


  _encode(data, meta) {
    if (Buffer.isBuffer(data)) {
      meta.buffer = true;
      return JSON.stringify({
        meta: meta
      });
    }

    return JSON.stringify({
      meta: meta,
      data: data
    });
  }


  _nextSequence() {
    if (this._sequence >= 4294967295) this._sequence = 0;
    return this._sequence++;
  }


  _reply(replies) {
    return new Promise((resolve, reject) => {
      let processed = {};
      let keys = Object.keys(replies);

      let error;

      keys.forEach(key => {
        if (error) return;

        let value = replies[key];

        if (Buffer.isBuffer(value)) {
          error = new errors.VertexSocketRemoteEncodeError('Cannot send buffer in reply');
          return reject(error);
        }

        if (value instanceof Promise == false) {
          processed[key] = value;
          delete replies[key];
          if (Object.keys(replies).length == 0) {
            resolve(processed);
          }
          return;
        }

        value
          .then(result => {
            if (Buffer.isBuffer(result)) {
              error = new errors.VertexSocketRemoteEncodeError('Cannot send buffer in reply');
              return reject(error);
            }
            processed[key] = result;
            delete replies[key];
            if (Object.keys(replies).length == 0) {
              resolve(processed);
            }
          })
          .catch(error => {
            delete replies[key];
            processed[key] = this._fromError(error);
            if (Object.keys(replies).length == 0) {
              resolve(processed);
            }
          });
      });
    });
  }


  _sendAck(decoded) {
    decoded.meta.ack = true;

    let encoded;

    try {
      encoded = JSON.stringify(decoded);
    }
    catch (error) {
      return this._sendNak(decoded.meta,
        new errors.VertexSocketRemoteEncodeError(error.toString())
      );
    }

    this._socket.send(encoded);
  }


  _sendNak(meta, error) {
    try {
      delete meta.ack;
      meta.nak = true;
      this._socket.send(JSON.stringify({
        meta: meta,
        error: this._fromError(error)
      }));
    } catch (e) {
      /* unlikely */
    }
  }


  _format(decoded) {
    if (decoded.meta.nak) {
      let error = this._toError(decoded.error);
      error.meta = decoded.meta;
      return error;
    }
    Object.keys(decoded).forEach(key => {
      if (!decoded[key]._error) return;
      decoded[key] = this._toError(decoded[key]);
    });
    return decoded;
  }


  _fromError(error) {
    if (!error) return {_error: true};

    let serialised = {
      _error: true,
      name: error.name,
      message: error.message
    };

    Object.keys(error).forEach(key => serialised[key] = error[key]);
    return serialised;
  }


  _toError(error) {
    if (!error) return new Error();

    error.name = error.name || 'Error';

    if (error.name.match(/^VertexSocket/)) {
      if (errors[error.name]) {
        let e = new errors[error.name](error.message);
        Object.keys(error).forEach(key => e[key] = error[key]);
        return e;
      }
    }

    let e = new Error(error.message || 'Nak');
    Object.keys(error).forEach(key => e[key] = error[key]);
    return e;
  }

}

module.exports = VertexSocket;
