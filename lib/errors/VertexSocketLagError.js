module.exports = class VertexSocketLagError extends Error {

  // received an ack or nak after timeout

  constructor(message, meta) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
    // meta.ts - time that the original message was sent
    // meta.seq - the sequence number of that message
    // meta.ack or meta.nak
  }

};
