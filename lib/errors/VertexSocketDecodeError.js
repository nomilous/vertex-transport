module.exports = class VertexSocketDecodeError extends Error {

  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }

};
