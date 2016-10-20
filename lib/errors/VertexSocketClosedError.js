module.exports = class VertexSocketClosedError extends Error {

  constructor(message, meta) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
  }

};
