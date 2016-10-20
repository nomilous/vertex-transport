module.exports = class VertexSocketReplyError extends Error {

  // received an ack or nak after timeout

  constructor(message, decoded) {
    super(message);
    this.name = this.constructor.name;
    this.meta = decoded.meta;
    if (decoded.data) this.data = decoded.data;
    if (decoded.error) this.error = decoded.error;
  }

};
