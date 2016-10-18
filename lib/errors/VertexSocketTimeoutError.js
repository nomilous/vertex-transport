module.exports = class VertexSocketTimeoutError extends Error {

  constructor(message, meta) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
    // meta.ts - time that the message being timed out was sent
    // meta.seq - the sequence number of the message
  }

};
