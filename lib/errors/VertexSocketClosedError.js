module.exports = class VertexSocketClosedError extends Error {

  constructor(message, meta, hadError) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
    this.hadError = hadError;
  }

};
