module.exports = class VertexSocketLagError extends Error {

  // received an ack or nak after timeout

  constructor(message, type, meta) {
    super(message);
    this.name = this.constructor.name;
    this.type = type; // 'ACK', 'NAK'
    this.meta = meta;
    // meta.ts - time that the original message was sent
    // meta.seq - the sequence number of that message
  }

};
