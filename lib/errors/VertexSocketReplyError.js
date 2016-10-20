module.exports = class VertexSocketReplyError extends Error {

  // received an ack or nak after timeout

  constructor(message, meta, data) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
    this.data = data;
  }

};
