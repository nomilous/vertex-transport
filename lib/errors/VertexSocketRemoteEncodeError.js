module.exports = class VertexSocketRemoteEncodeError extends Error {

  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }

};
