const { JSDOM } = require('jsdom');
const cytoscape = require('cytoscape');

// Setup minimal DOM environment
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Enable lenient validation mode
window.QuantickleConfig = { validation: { lenientMode: true, enabled: true } };

// Load validation and graph modules
const Validation = require('../js/validation.js');
window.Validation = Validation;
window.cytoscape = cytoscape;
require('../js/graph.js');

const GR = window.GraphRenderer;

// Batch with an unknown field that should be ignored in lenient mode
const batch = [
  { group: 'nodes', data: { id: 'n1', type: 'test', label: 'N1', foo: 'bar' } }
];

const result = GR.validateRenderBatch(batch);

if (!result.valid) {
  throw new Error('Expected batch to be valid in lenient mode: ' + result.errors.join('; '));
}

if (result.validElements.length !== 1) {
  throw new Error('Valid elements were not returned correctly in lenient mode');
}

console.log('validateRenderBatch allows unknown fields in lenient mode');
