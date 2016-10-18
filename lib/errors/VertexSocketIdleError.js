module.exports = class VertexSocketIdleError extends Error {

  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }

};
