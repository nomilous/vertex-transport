"use strict";

const {EventEmitter} = require('events');
const {Socket} = require('net');
const dface = require('dface');
const BufferList = require('bl');

const errors = require('./errors');
const {property, getter} = require('./utils');

const HEADER_LENGTH = 24;
const OFFSET_FLAGS_1 = 2; // 1 byte [unused, unused, reserved, reserved, reserved, reserved, reserved, reserved]
const OFFSET_LENGTH= 3;
const OFFSET_SEQUENCE = 7;
const OFFSET_TIMESTAMP = 11;
const OFFSET_FLAGS_2 = 19; // 1 byte [unused, unused, reserved, reserved, reserved, hasTimestamp, isNak, isAck]
const OFFSET_TYPE = 20;

const HEADER_1 = 0xC2;
const HEADER_2 = 0xB2;

const FLAG_ACK = 0x01;
const FLAG_NAK = 0x02;
const FLAG_HAS_TIMESTAMP = 0x04;

// const TYPE_HANDSHAKE_1 = 0x00;
// const TYPE_HANDSHAKE_2 = 0x01;
// const TYPE_HANDSHAKE_3 = 0x02;
const TYPE_NULL = 0x03;
const TYPE_STRING = 0x04;
const TYPE_NUMBER = 0x05;
const TYPE_BUFFER = 0x06;
const TYPE_OBJECT = 0x07;

class VertexSocket extends EventEmitter {

  static connect(config = {}) {
    return new Promise((resolve, reject) => {

      config.port = config.port || 65535;
      config.host = dface(config.host || '127.0.0.1');

      const socket = new Socket();
      const vertexSocket = new VertexSocket(socket, config);

      vertexSocket.once('error', reject);

      vertexSocket.connect(config, function () {
        vertexSocket.removeListener('error', reject);
        resolve(vertexSocket);
      });
    });
  }

  constructor(socket, config) {
    super();

    getter(this, 'socket', socket);
    property(this, 'sequence', 0);
    property(this, 'awaitingAck', {});

    // property(this, 'awaitingSeq', []); // order of awaitingAck(s)
    // Object.keys({123:{}, 9:1, 10:3, 2:2, 43:3})
    // [ '2', '9', '10', '43', '123' ]
    // (apparently they get sorted already)

    property(this, 'buffer', new BufferList);

    this.config = config = config || {};
    config.maxFrameSize = config.maxFrameSize || 128 * 1024; // 1MB

    socket.on('error', this._onError.bind(this));
    socket.on('connect', this._onConnect.bind(this));
    socket.on('close', this._onClose.bind(this));
    socket.on('data', this._onData.bind(this));
    socket.on('drain', this._onDrain.bind(this));
  }

  address() {
    return this.socket.address();
  }

  remoteAddress() {
    return {
      address: this.socket.remoteAddress,
      family: this.socket.remoteFamily,
      port: this.socket.remotePort
    }
  }

  connect() {
    return this.socket.connect.apply(this.socket, arguments);
  }

  destroy() {
    return this.socket.destroy.apply(this.socket, arguments);
  }

  pause() {
    return this.socket.pause();
  }

  resume() {
    return this.socket.resume();
  }

  write(data, timeout) {
    var _this = this;
    return new Promise((resolve, reject) => {

      const sequence = _this._nextSequence();
      const encoded = _this._encode(data);
      const length = HEADER_LENGTH + (encoded.payload ? encoded.payload.length : 0);
      const header = Buffer.alloc(HEADER_LENGTH);
      const ts = Date.now();

      header[0] = HEADER_1;
      header[1] = HEADER_2;
      header.writeUInt32BE(length, OFFSET_LENGTH);
      header.writeUInt32BE(sequence, OFFSET_SEQUENCE);
      header.writeDoubleBE(ts, OFFSET_TIMESTAMP);
      header[OFFSET_FLAGS_2] |= FLAG_HAS_TIMESTAMP;
      header[OFFSET_TYPE] = encoded.type;

      _this.awaitingAck[sequence] = {
        resolve: resolve,
        reject: reject,
        ts: ts
      };

      if (typeof timeout == 'number') {
        _this.awaitingAck[sequence].timeout = setTimeout(() => {
          _this.awaitingAck[sequence].reject(
            new errors.VertexSocketTimeoutError('Ack timeout', {
              seq: sequence,
              ts: ts
            })
          );
          delete _this.awaitingAck[sequence];
        }, timeout);
      }

      _this.socket.write(header);
      if (encoded.payload) _this.socket.write(encoded.payload);

    });
  }

  _onError(error) {
    this.emit('error', error);
  }

  _onConnect() {
    this.emit('connect');
  }

  _onClose(hadError) {
    let awaitingAck = this.awaitingAck;
    Object.keys(awaitingAck).forEach(sequence => {
      clearTimeout(awaitingAck[sequence].timeout);
      awaitingAck[sequence].reject(
        new errors.VertexSocketClosedError('Closed while awaiting ack', {
          seq: parseInt(sequence),
          ts: awaitingAck[sequence].ts
        }, hadError)
      );
      delete awaitingAck[sequence];
    });

    this.emit('close', hadError);
  }

  _onData(part) {
    this.buffer.append(part);

    while (this.buffer.length >= HEADER_LENGTH) {

      if (this.buffer.get(0) != HEADER_1 || this.buffer.get(1) != HEADER_2) {
        return this.socket.destroy(
          new errors.VertexSocketHeaderError('Bad header', 'EBADHEADER')
        );
      }

      let length = this.buffer.readUInt32BE(OFFSET_LENGTH);
      let sequence = this.buffer.readUInt32BE(OFFSET_SEQUENCE);
      let ts = this.buffer.readDoubleBE(OFFSET_TIMESTAMP);
      let meta = {
        seq: sequence,
        ts: ts
      };

      if (length > this.config.maxFrameSize) {
        let error = new errors.VertexSocketHeaderError('Frame too long', 'EFRAMELENGTH');
        this.emit('error', error);
        this._sendNak(sequence, ts, error, true);
        return;
      }

      if (this.buffer.length < length) return;

      let flags2 = this.buffer.get(OFFSET_FLAGS_2);
      let ackOrNak = (flags2 & FLAG_ACK) == FLAG_ACK || (flags2 & FLAG_NAK) == FLAG_NAK;

      let type = this.buffer.get(OFFSET_TYPE);

      let data = type !== TYPE_NULL
        ? this.buffer.slice(HEADER_LENGTH, length)
        : null;

      this.buffer.consume(length);

      try {
        let object;

        try {
          object = this._decode(type, data, ackOrNak);
        } catch (error) {
          if (ackOrNak) {
            this.awaitingAck[sequence].reject(error);
            clearTimeout(this.awaitingAck[sequence].timeout);
            delete this.awaitingAck[sequence];
            continue;
          }

          throw error;
        }

        if ((flags2 & FLAG_ACK) == FLAG_ACK) {
          if (!this.awaitingAck[sequence]) {
            try {
              this.emit('error', new errors.VertexSocketLagError('Response after timeout', 'ACK', {
                seq: sequence,
                ts: ts
              }));
            } catch (e) {
              // in case of no error handler
            }
            continue;
          }

          if (object) {
            var _this = this;
            Object.keys(object).forEach(function (key) {
              if (object[key].error) {
                object[key] = _this._toError(object[key])
              }
            });
          }

          object = object || {};
          object.meta = {
            seq: sequence,
            ts: ts
          };

          this.awaitingAck[sequence].resolve(object);
          clearTimeout(this.awaitingAck[sequence].timeout);
          delete this.awaitingAck[sequence];
          continue;
        }

        if ((flags2 & FLAG_NAK) == FLAG_NAK) {
          if (!this.awaitingAck[sequence]) {
            try {
              this.emit('error', new errors.VertexSocketLagError('Response after timeout', 'NAK', {
                seq: sequence,
                ts: ts
              }));
            } catch (e) {
            }
            continue;
          }
          this.awaitingAck[sequence].reject(this._toError(object));
          clearTimeout(this.awaitingAck[sequence].timeout);
          delete this.awaitingAck[sequence];
          continue;
        }

        let replies, tags;

        let reply = (tag, promise) => {
          if (typeof promise == 'undefined') {
            promise = tag;
            tag = typeof tags == 'undefined' ? tags = 0 : ++tags;
          }
          replies = replies || {};
          replies[tag] = promise;
        };

        this.emit('data', object, meta, reply);

        if (replies) return this._reply(replies)

          .then(results => this._sendAck(sequence, ts, results));

        this._sendAck(sequence, ts);

      } catch (error) {
        if (error.name == 'VertexSocketRemoteDecodeError') {
          this._sendNak(sequence, ts, error, false);
          continue;
        }

        this._sendNak(sequence, ts, {
            name: 'VertexSocketRemoteRuntimeError',
            message: error.toString(),
            code: error.code,
            // textStack: error.stack // danger?
          }, false
        );
      }
    }
  }

  _onDrain() {
    this.emit('drain');
  }

  _decode(type, data, ackOrNak = false) {
    try {
      if (!data) return data;

      if (type == TYPE_OBJECT) {
        return JSON.parse(data);
      }

      if (type == TYPE_STRING) {
        return data.toString();
      }

      if (type == TYPE_NUMBER) {
        let number = parseInt(data.toString());
        if (number.toString() == data.toString()) return number;
        return parseFloat(data.toString())
      }

      if (type == TYPE_BUFFER) {
        return data;
      }
    } catch (error) {
      if (ackOrNak) {
        throw new errors.VertexSocketDecodeError(
          error.toString(), error.code
        );
      }

      throw new errors.VertexSocketRemoteDecodeError(
        error.toString(), error.code
      );
    }

    if (ackOrNak) {
      throw new errors.VertexSocketDecodeError('Unrecognised type');
    }

    throw new errors.VertexSocketRemoteDecodeError('Unrecognised type');
  }

  _encode(data) {
    if (!data) {
      return {
        type: TYPE_NULL
      }
    }

    if (data instanceof Buffer) {
      return {
        type: TYPE_BUFFER,
        payload: data
      }
    }

    if (typeof data == 'object') {
      return {
        type: TYPE_OBJECT,
        payload: new Buffer(JSON.stringify(data))
      }
    }

    if (typeof data == 'string') {
      return {
        type: TYPE_STRING,
        payload: new Buffer(data)
      }
    }

    if (typeof data == 'number') {
      return {
        type: TYPE_NUMBER,
        payload: new Buffer(data.toString())
      }
    }

    throw new errors.VertexSocketEncodeError('Unrecognised type');
  }

  _nextSequence() {
    if (this.sequence >= 4294967295) this.sequence = 0;
    return this.sequence++;
  }

  _reply(pendingReplies) {
    // can't Promise.all, want errors and results
    return new Promise(resolve => {
      let replies = {};
      let keys = Object.keys(pendingReplies);
      keys.forEach(key => {
        let value = pendingReplies[key];
        if (value instanceof Promise == false) {
          replies[key] = value;
          delete pendingReplies[key];
          if (Object.keys(pendingReplies).length == 0) {
            resolve(replies);
          }
          return;
        }
        value.then(result => {
          replies[key] = result;
          delete pendingReplies[key];
          if (Object.keys(pendingReplies).length == 0) {
            resolve(replies);
          }
        }).catch(error => {
          let serialised = {
            name: error.name,
            message: error.message,
            code: error.code
          };
          Object.keys(error).forEach(key => serialised[key] = error[key]);
          serialised.error = true;
          replies[key] = serialised;
          delete pendingReplies[key];
          if (Object.keys(pendingReplies).length == 0) {
            resolve(replies);
          }
        });
      });
    });
  }

  _sendAck(sequence, ts, reply) {
    let encoded;

    try {
      encoded = this._encode(reply);
    } catch (e) {
      let error = new errors.VertexSocketRemoteEncodeError(e.toString());
      error.code = e.code;
      Object.keys(e).forEach(key => error[key] = e[key]);
      this._sendNak(sequence, ts, error);
      return;
    }

    const length = HEADER_LENGTH + (reply ? encoded.payload.length : 0);
    const header = Buffer.alloc(HEADER_LENGTH);

    header[0] = HEADER_1;
    header[1] = HEADER_2;
    header.writeUInt32BE(length, OFFSET_LENGTH);
    header.writeUInt32BE(sequence, OFFSET_SEQUENCE);
    header.writeDoubleBE(ts, OFFSET_TIMESTAMP);
    header[OFFSET_FLAGS_2] |= FLAG_ACK;
    header[OFFSET_FLAGS_2] |= FLAG_HAS_TIMESTAMP;
    header[OFFSET_TYPE] = encoded.type;

    this.socket.write(header);
    if (encoded.payload) this.socket.write(encoded.payload);
  }

  _sendNak(sequence, ts, error, end) {

    let errorObject;
    if (error.name != 'VertexSocketHeaderError') {
      errorObject = {
        name: error.name,
        message: error.message,
        code: error.code
      };

      Object.keys(error).forEach(key => {
        errorObject[key] = error[key];
      });
    }

    const encoded = this._encode(errorObject);
    const length = HEADER_LENGTH + (errorObject ? encoded.payload.length : 0);
    const header = Buffer.alloc(HEADER_LENGTH);

    header[0] = HEADER_1;
    header[1] = HEADER_2;
    header.writeUInt32BE(length, OFFSET_LENGTH);
    header.writeUInt32BE(sequence, OFFSET_SEQUENCE);
    header.writeDoubleBE(ts, OFFSET_TIMESTAMP);
    header[OFFSET_FLAGS_2] |= FLAG_NAK;
    header[OFFSET_FLAGS_2] |= FLAG_HAS_TIMESTAMP;
    header[OFFSET_TYPE] = encoded.type;

    if (end && !errorObject) {
      return this.socket.end(header);
    }

    if (end) {
      this.socket.write(header);
      this.socket.end(encoded.payload);
    }

    this.socket.write(header);
    if (errorObject) this.socket.write(encoded.payload);
  }

  _toError(nak) {
    if (!nak) {
      return new errors.VertexSocketHeaderError('Frame too long', 'EFRAMELENGTH');
    }

    if (!nak.name) {
      let e = new Error(nak.message);
      e.code = nak.code;
      Object.keys(nak).forEach(key => {
        e[key] = nak[key];
      });
      return e;
    }

    if (nak.name.match(/^VertexSocket/)) {
      if (errors[nak.name]) {
        let e = new errors[nak.name](nak.message, nak.code);
        Object.keys(nak).forEach(key => {
          e[key] = nak[key];
        });
        return e;
      }
    }

    let e = new Error(nak.message);
    Object.keys(nak).forEach(key => {
      e[key] = nak[key];
    });
    return e;
  }

}

VertexSocket.HEADER_LENGTH = HEADER_LENGTH;
VertexSocket.OFFSET_FLAGS_1 = OFFSET_FLAGS_1;
VertexSocket.OFFSET_LENGTH = OFFSET_LENGTH;
VertexSocket.OFFSET_SEQUENCE = OFFSET_SEQUENCE;
VertexSocket.OFFSET_TIMESTAMP = OFFSET_TIMESTAMP;
VertexSocket.OFFSET_FLAGS_2 = OFFSET_FLAGS_2;
VertexSocket.OFFSET_TYPE = OFFSET_TYPE;

VertexSocket.HEADER_1 = HEADER_1;
VertexSocket.HEADER_2 = HEADER_2;

VertexSocket.FLAG_ACK = FLAG_ACK;
VertexSocket.FLAG_NAK = FLAG_NAK;
VertexSocket.FLAG_HAS_TIMESTAMP = FLAG_HAS_TIMESTAMP;

// VertexSocket.TYPE_HANDSHAKE_1 = TYPE_HANDSHAKE_1;
// VertexSocket.TYPE_HANDSHAKE_2 = TYPE_HANDSHAKE_2;
// VertexSocket.TYPE_HANDSHAKE_3 = TYPE_HANDSHAKE_3;
VertexSocket.TYPE_NULL = TYPE_NULL;
VertexSocket.TYPE_STRING = TYPE_STRING;
VertexSocket.TYPE_NUMBER = TYPE_NUMBER;
VertexSocket.TYPE_BUFFER = TYPE_BUFFER;
VertexSocket.TYPE_OBJECT = TYPE_OBJECT;

module.exports = VertexSocket;
