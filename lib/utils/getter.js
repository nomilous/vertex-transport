module.exports = function(object, propertyName, propertyValue) {
  Object.defineProperty(object, propertyName, {
    get: function () {
      return propertyValue
    },
    enumerable: true
  })
};
