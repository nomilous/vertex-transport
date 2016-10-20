module.exports = class VertexSocketDataError extends Error {

  constructor(message, from) {
    super(message);
    this.name = this.constructor.name;
    this.from = from;
  }

};
