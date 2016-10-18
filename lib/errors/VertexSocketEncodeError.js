module.exports = class VertexSocketEncodeError extends Error {

  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }

};
