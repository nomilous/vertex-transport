module.exports = class VertexSocketRemoteEncodeError extends Error {

  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }

};
