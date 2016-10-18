module.exports = class VertexSocketConfigError extends Error {

  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }

};
