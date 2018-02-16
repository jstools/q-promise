
const Parole = require('./src/parole');

// console.log('Parole', Parole);
// console.log('new Parole', new Parole (function (resolve) {
//   // console.log('runner', this, arguments);
// }) );

new Parole (function (resolve) {
  resolve(1);
}).then(function (value) {
  console.log('value', value);
  return value + 1;
}).then(function (value) {
  console.log('value', value);
  throw value + 1;
  // throw new Parole(function () {
  //   return value + 1;
  // });
}).catch(function (value) {
  console.log('value', value);
  return value + 1;
});
