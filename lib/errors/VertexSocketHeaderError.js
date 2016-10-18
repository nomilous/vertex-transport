module.exports = class VertexSocketHeaderError extends Error {

  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }

};
