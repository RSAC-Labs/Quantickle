global.window = global.window || global;
global.document = global.document || {};

global.window.QuantickleUtils = global.window.QuantickleUtils || {};
require('../js/utils.js');

const utils = window.QuantickleUtils;
const duplicatedSource = {
  label: 'Body text only',
  info: 'Body text only'
};
const derived = utils.deriveCalloutFromLegacy(duplicatedSource, { defaultFormat: 'text' });
if (derived.title) {
  throw new Error('Derived callout title should be empty when label matches body');
}
if (derived.body !== 'Body text only') {
  throw new Error('Derived callout body should preserve legacy info text');
}
const explicitSource = {
  calloutTitle: 'Keep Me',
  info: 'Keep Me'
};
const explicit = utils.deriveCalloutFromLegacy(explicitSource, { defaultFormat: 'text' });
if (explicit.title !== 'Keep Me') {
  throw new Error('Explicit callout title should be preserved even if it matches body');
}
console.log('Callout derivation keeps legacy body text out of titles');
