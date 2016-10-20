module.exports = class VertexSocketTimeoutError extends Error {

  constructor(message, meta) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
  }

};
