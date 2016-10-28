"use strict";

const {EventEmitter} = require('events');
const dface = require('dface');
const {format} = require('util');
const WebSocket = require('ws');

const errors = require('./errors');

const PROTOCOL_VERSION_ARRAY = [1, 0];
const PROTOCOL_VERSION = '1.0';

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
    if (!this._socket) return;
    if (error) this.emit('error', error);
    this._socket.terminate();
  }


  pause() {
    if (!this._socket) return;
    return this._socket.pause();
  }


  resume() {
    if (!this._socket) return;
    return this._socket.resume();
  }


  ping(data) {
    if (!this._socket) return;
    // this._socket.ping.apply(this._socket, arguments);
    this._socket.ping(data);
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

    let version, meta, data;

    if (detail.binary) {
      meta = this._waitingMeta;
      meta.len = detail.buffer.length;
      data = message;
      delete this._waitingMeta;
    }

    else {
      try {
        let dataPosition = message.indexOf('[');
        version = message.substring(0, dataPosition).split('.');
        if (version[0] != PROTOCOL_VERSION_ARRAY[0]) {
          throw new Error('Protocol mismatch');
        }
        [meta, data] = JSON.parse(message.substring(dataPosition));
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

      if (!meta || typeof meta.seq !== 'number') {
        try {
          this.emit('error', new errors.VertexSocketDataError('Missing meta', this.remoteAddress()));
        }
        catch (e) {
          /* in case of no error handler */
        }
        this.close(1003, 'Missing meta');
        return;
      }

      meta.len = detail.buffer.length;

      if (meta.ack || meta.nak) {
        if (!this._waiting[meta.seq]) {
          try {
            this.emit('error', new errors.VertexSocketReplyError('Stray ack or nak', {meta: meta, data: data}));
          }
          catch (e) {
            /* in case of no error handler */
          }
          return;
        }

        clearTimeout(this._waiting[meta.seq].timeout);

        if (meta.nak) {
          this._waiting[meta.seq].reject(this._format(meta, data));
          delete this._waiting[meta.seq];
          return;
        }

        this._waiting[meta.seq].resolve(this._format(meta, data));
        delete this._waiting[meta.seq];
        return;
      }

      if (meta.buffer) {
        this._waitingMeta = meta;
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
      this.emit('data', data, meta, replyFn);
    }
    catch (error) {
      /* unhandled error in one of on('data') handlers, server will now crash, no ACK, no NAK */
      throw error;
    }

    let response = {meta: meta}; // allows for insertion of 3rd party meta by on'data' handler

    if (!replies) {
      this._sendAck(response);
      return;
    }

    this._reply(replies)

      .then(replies => {
        if (replies.nak) {
          return this._sendNak(response.meta, replies.error || replies.nak);
        }
        response.data = {};
        Object.keys(replies).forEach(key => response.data[key] = replies[key]);
        this._sendAck(response);
      })

      .catch(error => this._sendNak(response.meta, error))
  }


  _onPing(data, detail) {
    this.emit('ping', data /*, detail */);
  }


  _onPong(data, detail) {
    this.emit('pong', data /*, detail */);
  }


  // _onDrain() {
  //   this.emit('drain');
  // }


  _encode(data, meta) {
    if (Buffer.isBuffer(data)) {
      meta.buffer = true;
      return PROTOCOL_VERSION + JSON.stringify([meta]);
    }

    if (typeof data !== 'undefined') {
      return PROTOCOL_VERSION + JSON.stringify([meta, data]);
    }

    return PROTOCOL_VERSION + JSON.stringify([meta]);
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


  _sendAck(response) {
    response.meta.ack = true;

    let encoded;

    try {
      // encoded = JSON.stringify(response);
      encoded = this._encode(response.data, response.meta);
    }
    catch (error) {
      return this._sendNak(response.meta,
        new errors.VertexSocketRemoteEncodeError(error.toString())
      );
    }

    this._socket.send(encoded);
  }


  _sendNak(meta, error) {
    try {
      delete meta.ack;
      meta.nak = true;
      this._socket.send(this._encode(this._fromError(error), meta));
    } catch (e) {
      /* unlikely */
    }
  }


  _format(meta, data) {
    let formatted = data || {};

    if (typeof formatted.meta == 'undefined') {
      Object.defineProperty(formatted, 'meta', {
        value: meta,
        writable: true
      });
    }

    if (formatted.meta.nak) {
      let error = this._toError(formatted);
      error.meta = formatted.meta;
      return error;
    }

    Object.keys(formatted).forEach(key => {
      if (!formatted[key]._error) return;
      formatted[key] = this._toError(formatted[key]);
    });

    return formatted;
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
