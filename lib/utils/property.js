module.exports = function(object, propertyName, propertyValue, enumerable) {
  if (typeof enumerable == 'undfined') enumerable = false;
  Object.defineProperty(object, propertyName, {
    value: propertyValue,
    enumerable: enumerable,
    writable: true
  })
};
